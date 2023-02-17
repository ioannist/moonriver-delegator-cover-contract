# Delegator Rewards Cover Contract for Moonbeam Collators

This contract allows Moonbeam (Moonriver) collators to guarantee staking rewards to their delegators. Collators (members) deposit an amount to the contract to cover any missed rounds from being down or out. The contract receives information about the state of the collators from an [oracle](https://github.com/ioannist/moonriver-delegator-cover-oracle), and credits the accounts of delegators if a member collator does not sign any blocks on a specific round. The oracle operates as a quorum of oracle members that run a service to periodically query the chain and report back the staking state.

## Contracts
Most of the protocol is implemented as a set of smart contracts.
These contracts are located in the [contracts/](contracts/) directory.

### [Inactivitycover](contracts/InactivityCover.sol)
Main contract that implements the cover insurance logic.

### [DepositStaking](contracts/DepositStaking.sol)
Deposits can be staked. Members do not earn staking rewards and only the manager can withdraw these rewards. Because staking decreases the reducible contract balance, the manager must take care to allow for enough funds to be available to cover delegator claims and member deposit withdrawals. If a payment fails, the contract disables further delegations by the manager, and enables an open-access method for undelegating funds.

### [Oracle](contracts/Oracle.sol)
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
# make sure Moonbeam node is v0.27.2 or later; if not, remove old docker image and reinstall
```

### Make .secret.env file in root folder

```
# Dev
SUPERIOR_KEY="99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342"
DEV_KEY="99B3C12287537E38C90A9219D4CB074A89A16E9CDB20BF85728EBD97C343E342"
MANAGER_KEY="c62cdb5b38cad27b9434933d087814a3bd848e67aeee66024ab65b1ccb9962b0"
MEMBER1_KEY="0x5fb92d6e98884f76de468fa3f6278f8807c48bebc13595d45af5bdc4da702133"
MEMBER2_KEY="eb5c4f9e734bfbd7dad641d348e1cc35dc22acf332cbecbc6ef163f20981392b"
MEMBER3_KEY="52d6050aae9787adab586a79d8dcfe46a5a82b262ab4fce33470cf318cdba757"
DELEGATOR1_KEY="bd283860f92e4c2626432e2c2d7b272a8818babc862f8cc121fc60804100e2f1"
DELEGATOR2_KEY="9cb20912f72e7993be55aac8000fa63453a9d0c932563ede6fc5a9193de1851b"
DELEGATOR3_KEY="eec6cb0332e91b94ebabb25f6b974dbb957c896a2c24f1763cfae12f02002245"
ORACLE_MANAGER_KEY="7ea73166025b7982a2d7c708fef083c87e159455f621a0a8b3816b135b6faa37"
AGENT007_KEY="8109a2d5ae13ddfb7ddadd8569004cb5e3b20484e889e1ac4883f1adc318d717"
MEMBER1_PROXY_KEY="87cbe4c17819499ab99ad9005cc3afe730b684d5d64d701e73d8b08791231239"
MEMBER2_PROXY_KEY="2a66481f08a4db6420bd865145a74c067aabfcf60c6893afc7394a138c7a681b"
MEMBER3_PROXY_KEY="03373da1e0e622131bc7c2f0d348ec21f640ab82f43ce285751d77acf4c09e3c"
ORACLE1_KEY="362f385cd2ad1474dc8081d3124cb7cc439147148f5a2de332fb11c8753c96cb"
ORACLE2_KEY="c2975923781e283db769b787632589b451e892dac559afcc4c3be87376a1383f"
ORACLE3_KEY="ccc01b2035ea819bdee378ab29cbcbc5fc52c3928a3790eb78959dfa471647d9"

# Moonbase
MOONBASE_KEY="<MOONASE_FUNDED_ACCOUNT>"
MOONBASE_MANAGER="<MOONASE_FUNDED_ACCOUNT>"
MOONBASE_ORACLE_MEMBERS_MANAGER="<MOONASE_FUNDED_ACCOUNT>"
MOONBASE_ORACLE_MEMBER="<MOONASE_FUNDED_ACCOUNT>"
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

### Deployed Contracts on Moonbeam

AuthManager
[0x2221d5f95004888a8703a3fe0A970aea791bDc60](https://moonriver.moonscan.io/address/0x2221d5f95004888a8703a3fe0A970aea791bDc60)

Oracle
[0xC3a6F635a4696Cbf8436f9e917F16D4e4D9673Fe](https://moonriver.moonscan.io/address/0xC3a6F635a4696Cbf8436f9e917F16D4e4D9673Fe)

OracleMaster
[0x455F39bdf5a5c7932D3c4C40694bd192C1d735Ed](https://moonriver.moonscan.io/address/0x455F39bdf5a5c7932D3c4C40694bd192C1d735Ed)

InactivityCover
[0x1d6061E3aB039149c7C2F55ca1f5D3e27A6B896d](https://moonriver.moonscan.io/address/0x1d6061E3aB039149c7C2F55ca1f5D3e27A6B896d)

DepositStaking
[0xaFE179Ea99d52656f21E94D83334F68208fb5139](https://moonriver.moonscan.io/address/0xaFE179Ea99d52656f21E94D83334F68208fb5139)
