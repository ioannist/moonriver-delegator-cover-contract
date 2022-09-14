require('dotenv').config({ path: '.secret.env' })
const HDWalletProvider = require('@truffle/hdwallet-provider');

// Moonbase Alpha Private Key --> Please change this to your own Private Key with funds
// NOTE: Do not store your private key in plaintext files
//       this is only for demostration purposes only
const privateKeyMoonbase = process.env.MOONBASE_KEY;

const privateKeys = [
   process.env.SUPERIOR_KEY,
   process.env.DEV_KEY,
   process.env.MANAGER_KEY,
   process.env.MEMBER1_KEY,
   process.env.MEMBER2_KEY,
   process.env.DELEGATOR1_KEY,
   process.env.DELEGATOR2_KEY,
   process.env.ORACLE_MANAGER_KEY
];

module.exports = {
   networks: {
      // Moonbeam Development Network
      dev: {
         provider: () => {
            return new HDWalletProvider({
               privateKeys,
               providerOrUrl: 'http://localhost:9933/',
               numberOfAddresses: 10,
               //derivationPath: "m/44'/60'/0'/0"
            });
         },
         network_id: 1281,
      },
      // Moonbase Alpha TestNet
      moonbase: {
         provider: () => {
            if (!privateKeyMoonbase.trim()) {
               throw new Error(
                  'Please enter a private key with funds to send transactions to TestNet'
               );
            }
            return new HDWalletProvider(
               privateKeyMoonbase,
               'https://rpc.api.moonbase.moonbeam.network'
            );
         },
         network_id: 1287,
      },
   },
   // Solidity 0.8.0 Compiler
   compilers: {
      solc: {
         version: '^0.8.0',
      },
   },
   // Moonbeam Truffle Plugin & Truffle Plugin for Verifying Smart Contracts
   plugins: ['moonbeam-truffle-plugin', 'truffle-plugin-verify'],
};
