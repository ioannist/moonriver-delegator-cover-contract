# Delegator Rewards Cover Contract for Moonbeam Collators

This contract allows Moonbeam (Moonriver) collators to guarantee staking rewards to their delegators. Collators (members) deposit an amount to the contract to cover any missed rounds from being down or out. The contract receives information about the state of the collators from an [oracle](https://github.com/ioannist/moonriver-delegator-cover-oracle), and credits the accounts of delegators if a member collator does not sign any blocks on a specific round. The oracle operates as a quorum of oracle members that run a docker instance to periodically query the chain and report back the staking state.

## Contracts
Most of the protocol is implemented as a set of smart contracts.
These contracts are located in the [contracts/](contracts/) directory.

### [Inactivitycover](contracts/InactivityCover.sol)
Main contract that implements the cover insurance logic.

### [DepositStaking](contracts/DepositStaking.sol)
Deposits can be staked (subject to the staking and proxy precompiles becoming activated on Moonriver and Moonbeam). Members do not earn staking rewards and only the manager can withdraw these rewards. Because staking decreases the reducible contract balance, the manager must take care to allow for enough funds to be available to cover future/potential delegator claims and member decrease requests. If a payment fails, the contract disables further delegations by the manager, and enables an open method for undelegating funds.

### [Oracle](contracts/Oracle.sol)
Oracle contains logic to provide actual relaychain staking ledgers state to ledger contracts.
Contract uses consensus mechanism for protecting from malicious members. Pushing the data to InactivityCover requires that a particular quorum from oracle members report and agree on the new state. This is forked from the [Lido contract](https://github.com/mixbytes/lido-dot-ksm).

### [OracleMaster](contracts/OracleMaster.sol)
The hub for all oracles, which receives all reports from oracles members and simply sends them to oracles. This is forked from the Lido contract.

### [AuthManager](contracts/AuthManager.sol)
A contract which manages roles for the whole protocol. New and old roles can be added and removed. This is forked from the Lido contract.


## Quick start
### Install dependencies

```bash=
npm i
truffle run moonbeam install
truffle run moonbeam start
```

### Make .secret.env file in root folder

```
# Dev
SUPERIOR_KEY="8075991ce870b93a8870eca0c0f91913d12f47948ca0fd25b49c6fa7cdbeee8b"
DEV_KEY="0b6e18cafb6ed99687ec547bd28139cafdd2bffe70e6b688025de6b445aa5c5b"
MANAGER_KEY="39539ab1876910bbf3a223d84a29e28f1cb4e2e456503e7e91ed39b2e7223d68"
MEMBER1_KEY="5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133"
MEMBER2_KEY="7dce9bc8babb68fec1409be38c8e1a52650206a7ed90ff956ae8a6d15eeaaef4"
DELEGATOR1_KEY="b9d2ea9a615f3165812e8d44de0d24da9bbd164b65c4f0573e1ce2c8dbd9c8df"
DELEGATOR2_KEY="96b8a38e12e1a31dee1eab2fffdf9d9990045f5b37e44d8cc27766ef294acf18"
ORACLE_MANAGER_KEY="0d6dcaaef49272a5411896be8ad16c01c35d6f8c18873387b71fbc734759b0ab"
```

### Compile contracts

```bash
truffle compile
```

### Run tests

```bash
truffle test --network dev
```

### Migrate

```bash
truffle migrate --network dev
```

### Deployed Contracts on Moonriver

AuthManager
[0xdDBEa1588fB4738639E1d8d63cf10E30d7f2dc95](https://moonriver.moonscan.io/address/0xdDBEa1588fB4738639E1d8d63cf10E30d7f2dc95)

Oracle
[0xcd22F21a87690E8d96e14AB7040FFFc7C02eBdDF](https://moonriver.moonscan.io/address/0xcd22F21a87690E8d96e14AB7040FFFc7C02eBdDF)

OracleMaster
[0x09b3941c7c75928770a10FbabAd706cBddf559Ee](https://moonriver.moonscan.io/address/0x09b3941c7c75928770a10FbabAd706cBddf559Ee)

InactivityCover
[0xb88FDd5aF81442EA480AFc6eED071B1A8a8641b5](https://moonriver.moonscan.io/address/0xb88FDd5aF81442EA480AFc6eED071B1A8a8641b5)

DepositStaking
[0xc29005f0c84ee47eD4b91B6c9549306AE4a839b4](https://moonriver.moonscan.io/address/0xc29005f0c84ee47eD4b91B6c9549306AE4a839b4)
