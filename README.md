# Delegator Rewards Cover Contract for Moonbeam Collators

This contract allows Moonbeam (Moonriver) collators to guarantee staking rewards to their delegators. Collators (members) deposit an amount to the contract to cover any missed rounds from being down or out. The contract receives information about the state of the collators from an oracle, and credits the accounts of delegators if a member collator does not sign any blocks on a specific round. The oracle operates as a quorum of oracle members that run a docker instance to periodically query the chain and report back the staking state.

## Contracts
Most of the protocol is implemented as a set of smart contracts.
These contracts are located in the [contracts/](contracts/) directory.

### [Inactivitycover](contracts/InactivityCover.sol)
Main contract that implements the cover insurance logic.

### [DepositStaking](contracts/DepositStaking.sol)
Deposits can be staked (subject to the staking and proxy precompiles becoming activated on Moonriver and Moonbeam). Members do not earn staking rewards and only the manager can withdraw these rewards. Because staking decreases the reducible contract balance, the manager must take care to allow for enough funds to be available to cover future/potential delegator claims and member decrease requests. If a payment fails, the contract disables further delegations by the manager, and enables an open method for undelegating funds.

### [Oracle](contracts/Oracle.sol)
Oracle contains logic to provide actual relaychain staking ledgers state to ledger contracts.
Contract uses consensus mechanism for protecting from malicious members. Pushing the data to InactivityCover requires that a particular quorum from oracle members report and agree on the new state. This is forked from the Lido contract.

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
