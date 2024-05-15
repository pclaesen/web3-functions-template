import { Web3Function, Web3FunctionContext} from "@gelatonetwork/web3-functions-sdk";
import { Contract, ethers, BigNumber } from "ethers";
import axios from "axios";
import { paytrAbi } from './abi';

// Fill this out with your Web3 Function logic
Web3Function.onRun(async (context: Web3FunctionContext) => {
    const { multiChainProvider } = context;
    const provider = multiChainProvider.chainId(11155111);
    const abiCoder = ethers.utils.defaultAbiCoder;
    const contractAddress = "0xDC7E3C54Cde09d6211d59f91258Ec2407ebf2d49";

  const RPC_URL = await context.secrets.get("PROVIDER_URLS");
  if (!RPC_URL)
    return { canExec: false, message: `PROVIDER_URLS not set in secrets` };

  const paytrContract = new Contract(contractAddress, paytrAbi, provider);

  const redeemedInvoicesArray: any[] = []; //contains all the payment references that were already paid out
  const paymentReferenceArray: any[] = []; //contains all the payment references that were prepaid
  const paymentsToRedeemArray: any[] = []; //if any, contains the payment references that will be redeemed

  const prepaidInvoices = await axios.post(RPC_URL, {
      jsonrpc: '2.0',
      id: 0,
      method: 'eth_getLogs',
      params: [{
          "fromBlock": "0x591E36",
          "toBlock": "latest",
          "address": contractAddress,
          "topics": ["0x160b9883c8416d313cc749bc5858db361276143105365a035258beace5bf3b3e"] //payment event

      }],
      headers: {
          'Content-Type': 'application/json',
      },
  });

  // Decode response.data and write payment references to array
  
  for (let i = 0; i < prepaidInvoices.data.result.length; i++) {
    const txDataRaw = prepaidInvoices.data.result[i].data;
    const txData = abiCoder.decode(["address", "address", "address", "uint", "uint", "uint", "bytes"], txDataRaw);
    const txdueDate = txData[4];
    const txPaymentReference = txData[6];
    let txDueDateInMiliseconds = Number(txdueDate * 1000);
    let currentTimeInMiliseconds = Number(Date.now());
    if(txDueDateInMiliseconds < currentTimeInMiliseconds) {
      paymentReferenceArray.push(txPaymentReference);
    }
  }
  if(paymentReferenceArray.length == 0) {
    return { canExec: false, message: "no payments due"};
  }
  

  //get all the redeemed invoices

  const redeemedInvoices = await axios.post(RPC_URL, {
      jsonrpc: '2.0',
      id: 0,
      method: 'eth_getLogs',
      params: [{
          "fromBlock": "0x591E36",
          "toBlock": "latest",
          "address": contractAddress,
          "topics": ["0x3c77ae279df37c7ea5dd3a57f101c57dac95417ce9c24279d6ec87d9399c82d7"] //redeem event

      }],
      headers: {
          'Content-Type': 'application/json',
      },
  });
  console.log(redeemedInvoices);
  if(redeemedInvoices.data.result.length > 0) {
      
      for (let i = 0; i < redeemedInvoices.data.result.length; i++) {
          const txDataRedemeedInvoicesRaw = redeemedInvoices.data.result[i].data;
          const txDataRedeemedInvoices = abiCoder.decode(["address", "address", "address", "uint", "bytes", "uint"], txDataRedemeedInvoicesRaw);
          const txPaymentReference = txDataRedeemedInvoices[4];
          redeemedInvoicesArray.push(txPaymentReference);
      }
  } else{
      console.log("There are no invoices redeemed yet");
  }

  for(let i = 0; i < paymentReferenceArray.length; i++) { //the references in this array are due
    if(!redeemedInvoicesArray.includes(paymentReferenceArray[i])) {
      paymentsToRedeemArray.push(paymentReferenceArray[i]);
    }
}

  if(paymentsToRedeemArray.length > 0) {
    return {
      canExec: true,
      callData: paytrContract.interface.encodeFunctionData("payOutERC20Invoice", [paymentsToRedeemArray]),
    };
  } else {
    return { canExec: false, message: `Nothing to pay` };
  }
  
});