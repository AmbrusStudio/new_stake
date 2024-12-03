// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SUI_CLOCK_OBJECT_ID } from "@mysten/sui/utils";

import {
    E4C_PACKAGE, // The package ID of the E4C coin
    STAKING_PACKAGE, // The package ID of the Staking
    SUI_NETWORK, // The URL of the Sui netw
    ADMIN_CAP,
    ADMIN_PHRASE, // Mnemonic phrase managed by Ambrus to sign transactions
    PLAYER_PHRASE, // Mnemonic phrase managed by a Player to sign transactions
    GAME_LIQIUIDITY_POOL, // The address of the GamingLiquitidyPool shared object
    STAKING_CONFIG // The ID of the StakingConfig shared object
  } from "./config";

// Create a client to connect to the Sui network
const getClient = () => {
  console.log("Connecting to ", SUI_NETWORK);
    let client = new SuiClient({
    url: SUI_NETWORK,
    });

  return client;
};

// Derive the keypair from the Mnemonic phrase to sign transactions
const getSigner = (signer: string) => {
  // derive keypair from the Mnemonic phrase
  const keypair = Ed25519Keypair.deriveKeypair(signer);
  return keypair;
};

// Instantiate the client
const client = getClient();

// Constants
const COIN_SIZE = 10_000; // The size of a splitted E4C coin
const E4C_COIN_TYPE = `0x2::coin::Coin<${E4C_PACKAGE}::e4c::E4C>`;
const E4C_TYPE = `${E4C_PACKAGE}::e4c::E4C`;
const StakeRequest = `${STAKING_PACKAGE}::staking::StakingReceipt`;

// Derive addresses from the Mnemonic phrases
console.log("ADMIN_PHRASE", ADMIN_PHRASE);
let adminAddress = getSigner(ADMIN_PHRASE).getPublicKey().toSuiAddress();
let playerAddress = getSigner(PLAYER_PHRASE).getPublicKey().toSuiAddress();

//---------------------------------------------------------
/// Split E4C coins
//---------------------------------------------------------
const splitCoins = async (numberOfCoins: number = 5) => {

    let tx = new Transaction();
    // example of how to read from an address
    const userObjects = await client.getOwnedObjects({
        owner: adminAddress,
        options: {
        showContent: true,
        showType: true,
        },
    });

    // getting all objects of type E4C 
    const E4CObjects = userObjects?.data?.filter((elem: any) => {
        return elem?.data?.type === E4C_COIN_TYPE && elem?.data.content?.amount >= COIN_SIZE;
    });

    // get the first E4C coin
    const e4cCoin = E4CObjects[0].data?.objectId as string;
  
    for (let i = 0; i < numberOfCoins; i++) {
      let coin = tx.splitCoins(e4cCoin, [tx.pure.u64(COIN_SIZE)]);
      // transfer the splitted coins to the admin address handled by Ambrus
      tx.transferObjects([coin], tx.pure.address(adminAddress));
    }
    // sign and execute the transaction block
    let res = await client.signAndExecuteTransaction({
        transaction: tx,
      requestType: "WaitForLocalExecution",
      signer: getSigner(ADMIN_PHRASE),
      options: {
        showEffects: true,
        },
    });
    console.log(res);
  };

//---------------------------------------------------------
/// Top-up the GamingPool with E4C coins
//---------------------------------------------------------
const topUpGamingPool = async () => {

    let tx = new Transaction();
console.log(adminAddress)
    // Get all objects owned by the admin address
    const userObjects = await client.getOwnedObjects({
        owner: adminAddress,
        options: {
        showContent: true,
        showType: true,
        },
    });

   
    // Filter the E4C coins
    const E4CObjects = userObjects?.data?.filter((elem: any) => {
        return elem?.data?.type === E4C_COIN_TYPE && elem?.data?.content?.fields?.balance >= 1;
    });
    console.log(JSON.stringify(E4CObjects));
    const e4cCoin = E4CObjects[0].data?.objectId as string;

    tx.moveCall({
      target: `${STAKING_PACKAGE}::staking::place_in_pool`,
      arguments: [
        tx.object(GAME_LIQIUIDITY_POOL),
        tx.object(e4cCoin)
        ],
    });
    try {
        let txRes = await client.signAndExecuteTransaction({
            transaction: tx,
          requestType: "WaitForLocalExecution",
          signer: getSigner(ADMIN_PHRASE),
          options: {
            showEffects: true,
            },
        });
    
        console.log(txRes);
      } catch (e) {
        console.error("Could not place $e4c in pool", e);
      }
  };

//---------------------------------------------------------
/// Transfer E4C coins to the Player address
//---------------------------------------------------------  
const transferE4CToPlayer = async () => {

    let tx = new Transaction();
    
    // Get all objects owned by the admin address
    const userObjects = await client.getOwnedObjects({
        owner: adminAddress,
        options: {
        showContent: true,
        showType: true,
        },
    });

    // Filter the E4C coins
    const E4CObjects = userObjects?.data?.filter((elem: any) => {
        return elem?.data?.type === E4C_COIN_TYPE;
    });
    const e4cCoin = E4CObjects[0].data?.objectId as string;

    // Transfer the E4C coin to the player address
    tx.transferObjects([e4cCoin], tx.pure.address(playerAddress));
  
    let res = await client.signAndExecuteTransaction({
        transaction: tx,
      requestType: "WaitForLocalExecution",
      signer: getSigner(ADMIN_PHRASE),
      options: {
        showEffects: true,
        },
    });
    console.log(res);
  };

//---------------------------------------------------------
/// Stake E4C coins
//---------------------------------------------------------  
const stake = async () => {
    
    let tx = new Transaction();

    // example of how to read an address
    const userObjects = await client.getOwnedObjects({
        owner: playerAddress,
        options: {
        showContent: true,
        showType: true,
        },
    });

    const e4cObjects = userObjects?.data?.filter((elem: any) => {
        return elem?.data?.type === E4C_COIN_TYPE;
    });

    // This coin will be provided by the user to stake
    let e4cCoin = e4cObjects[0].data?.objectId as string;

    let stakingReceipt = tx.moveCall({
        target: `${STAKING_PACKAGE}::staking::new_staking_receipt`,
        arguments: [
            tx.object(e4cCoin), // The E4C coin object to stake
            tx.object(GAME_LIQIUIDITY_POOL),
            tx.object(SUI_CLOCK_OBJECT_ID),
            tx.object(STAKING_CONFIG),
            tx.pure.u64("10"), // 90 days
            ],
        });
    
        // Transfer the E4C coin to the player address
    tx.transferObjects([stakingReceipt], tx.pure.address(playerAddress));

    tx.setGasBudget(100000000);

    try {
        let txRes = await client.signAndExecuteTransaction({
            transaction: tx,
        requestType: "WaitForLocalExecution",
        signer: getSigner(PLAYER_PHRASE),
        options: {
            showEffects: true,
            },
        });
        console.log(txRes);
    } catch (e) {
        console.error("Could not stake $e4c in pool", e);
    }
};
const queryE4cBalance = async () => {
    const balance = await client.getBalance({
        owner: playerAddress,
        coinType: E4C_TYPE,
    });
    console.log(balance);
}

const queryE4c = async () => {

    const e4cObjects = await client.getOwnedObjects({
        owner: playerAddress,
        filter: {
            MatchAll: [
                {
                    StructType: StakeRequest,
                },
                {
                    AddressOwner: playerAddress,
                },
            ],
        },
    });
    console.log(JSON.stringify(e4cObjects))
}

const addConfig = async () => {
    let tx = new Transaction();
    tx.moveCall({
        target: `${STAKING_PACKAGE}::config::add_staking_rule`,
        arguments: [
            tx.object(ADMIN_CAP),
            tx.object(STAKING_CONFIG),
            tx.pure.u64(1),
            tx.pure.u16(1000),
            tx.pure.u64(1000000000),
            tx.pure.u64(1000000000000000),
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
    });
    try {
        let txRes = await client.signAndExecuteTransaction({
            transaction: tx,
            requestType: "WaitForLocalExecution",
            signer: getSigner(ADMIN_PHRASE),
            options: {
                showEffects: true,
            },
        });
        console.log(txRes);
    } catch (e) {
        console.error("Could not add staking rule", e);
    }
}

const withdrawE4c = async () => {

    let tx = new Transaction();
    let coins= tx.moveCall({
        target: `${STAKING_PACKAGE}::staking::e4c_tokens_withdraw`,
        arguments: [
            tx.object(ADMIN_CAP),
            tx.object(GAME_LIQIUIDITY_POOL),
            tx.pure.u64(299000000000),
        ],
    });
    tx.setGasBudget(10000000);
    tx.transferObjects([coins], tx.pure.address(adminAddress));
    try {
        let txRes = await client.signAndExecuteTransaction({
            transaction: tx,
            requestType: "WaitForLocalExecution",
            signer: getSigner(ADMIN_PHRASE),
            options: {
                showEffects: true,
            },
        });
        console.log(txRes);
    } catch (e) {
        console.error("Could not receive rewards", e);
    }
}
const queryAddress = async () => {
    console.log("Admin Address: ", adminAddress);
    console.log("Player Address: ", playerAddress);
}
//---------------------------------------------------------
/// Unstake and claim rewards
//--------------------------------------------------------- 
const unstake = async (staking_receipt: string) => {
    
    let tx = new Transaction();

    let [rewards] = tx.moveCall({
        target: `${STAKING_PACKAGE}::staking::unstake`,
        arguments: [
            tx.object(staking_receipt),
            tx.object(SUI_CLOCK_OBJECT_ID),
        ],
        });

    tx.transferObjects([rewards], tx.pure.address(playerAddress));

    // tx.setGasBudget(1000000000);

    try {
        let txRes = await client.signAndExecuteTransaction({
            transaction: tx,
        requestType: "WaitForLocalExecution",
        signer: getSigner(PLAYER_PHRASE),
        options: {
            showEffects: true,
            },
        });
        console.log(txRes);
    } catch (e) {
        console.error("Could not receive rewards", e);
    }
};

//---------------------------------------------------------
/// Entry point to run the functions
//--------------------------------------------------------- 
if (process.argv[2] === undefined) {
    console.log("Please provide a command");
  } else {
    const command = process.argv[2];
    switch (command) {
        case "queryAddress":
            queryAddress();
            break;
        case "splitCoins":
            splitCoins();
            break;
        case "addConfig":
            addConfig();
            break;
        case "topUpGamingPool":
            topUpGamingPool();
            break;
        case 'tokenBalance':
            queryE4cBalance();
            break;
        case 'queryE4c':
            queryE4c();
            break;
        case "transferE4CToPlayer":
            transferE4CToPlayer();
            break;
        case "withE4c":
            withdrawE4c();
            break;
        case "stake":
            stake();
            break;
        case "unstake":
            // Provide the staking receipt as an argument
            unstake("0x10e762a591fc203b337f538201eb1cdecc9d460aa4eb1586e72e9c5f0d2fe341");
            break;    
      }
    }


