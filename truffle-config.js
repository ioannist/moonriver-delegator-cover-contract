require('dotenv').config({ path: '.secret.env' })
const HDWalletProvider = require('@truffle/hdwallet-provider');

// Moonbase Alpha Private Key --> Please change this to your own Private Key with funds
// NOTE: Do not store your private key in plaintext files
//       this is only for demostration purposes only
const privateKeysMoonbase = [
   process.env.MOONBASE_KEY,
   process.env.MOONBASE_MANAGER,
   process.env.MOONBASE_ORACLE_MEMBERS_MANAGER,
   process.env.MOONBASE_ORACLE_MEMBER
];

const privateKeysMoonriver = [
   process.env.MOONRIVER_KEY,
   process.env.MOONRIVER_MANAGER,
   process.env.MOONRIVER_ORACLE_MEMBERS_MANAGER,
   process.env.MOONRIVER_ORACLE_MEMBER
];

const privateKeys = [
   process.env.SUPERIOR_KEY,
   process.env.DEV_KEY,
   process.env.MANAGER_KEY,
   process.env.MEMBER1_KEY,
   process.env.MEMBER2_KEY,
   process.env.MEMBER3_KEY,
   process.env.DELEGATOR1_KEY,
   process.env.DELEGATOR2_KEY,
   process.env.DELEGATOR3_KEY,
   process.env.ORACLE_MANAGER_KEY,
   process.env.AGENT007_KEY,
   process.env.MEMBER1_PROXY_KEY,
   process.env.MEMBER2_PROXY_KEY,
   process.env.MEMBER3_PROXY_KEY,
   process.env.ORACLE1_KEY,
   process.env.ORACLE2_KEY,
   process.env.ORACLE3_KEY
];

module.exports = {
   networks: {
      // Moonbeam Development Network
      dev: {
         provider: () => {
            return new HDWalletProvider({
               privateKeys,
               providerOrUrl: 'http://localhost:9933/',
               numberOfAddresses: 17,
               //derivationPath: "m/44'/60'/0'/0"
            });
         },
         network_id: 1281,
      },
      // Moonbase Alpha TestNet
      moonbase: {
         provider: () => {
            return new HDWalletProvider({
               privateKeys: privateKeysMoonbase,
               providerOrUrl: 'http://45.82.64.32:9933/'
            });
         },
         network_id: 1287,
         //networkCheckTimeout: 60000,
         //timeoutBlocks: 200
      },
      moonriver: {
         provider: () => {
            return new HDWalletProvider({
               privateKeys: privateKeysMoonriver,
               providerOrUrl: 'https://moonriver.api.onfinality.io/public'
            });
         },
         network_id: 1285,
         networkCheckTimeout: 60000,
         timeoutBlocks: 200
      },
   },
   // Solidity 0.8.2 Compiler
   compilers: {
      solc: {
         version: '0.8.17',
         settings: {
            optimizer: {
              enabled: true,
              runs: 365*12*10*10,
            },
            viaIR: true
          }
      },
   },
   // Moonbeam Truffle Plugin & Truffle Plugin for Verifying Smart Contracts
   plugins: ['moonbeam-truffle-plugin', 'truffle-plugin-verify'],
};
