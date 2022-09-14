const AuthManager = artifacts.require("AuthManager");
const InactivityCover = artifacts.require("InactivityCover");
const Oracle = artifacts.require("Oracle");
const OracleMaster = artifacts.require("OracleMaster");
const DepositStaking = artifacts.require("DepositStaking");


module.exports = async (deployer, network, accounts) => {

  require('dotenv').config()
  const _min_deposit = web3.utils.toWei(process.env.MIN_DEPOSIT, "ether");
  const _max_deposit_total = web3.utils.toWei(process.env.MAX_DEPOSIT_TOTAL, "ether");
  const _stake_unit_cover = web3.utils.toWei(process.env.STAKE_UNIT_COVER, "wei");
  const _min_payout = web3.utils.toWei(process.env.MIN_PAYOUT, "ether");
  const _eras_between_forced_undelegation = process.env.ERAS_BETWEEN_FORCED_UNDELEGATION;
  const _quorum = process.env.QUORUM;
  
  const superior = accounts[0];
  const manager = accounts[1];
  console.log(`Superior is ${superior}`);

  console.log(`Deploying AuthManager`);
  await deployer.deploy(AuthManager);
  let AM = await AuthManager.deployed();
  const _auth_manager = AM.address;

  console.log(`Initializing AuthManager`);
  await AM.initialize(superior);

  console.log(`Adding manager role ${manager}`)
  const managerHash = web3.utils.sha3('ROLE_MANAGER', { encoding: 'hex' })
  await AM.add(managerHash, manager);

  console.log(`Deploying OracleMaster`);
  await deployer.deploy(OracleMaster);
  let OM = await OracleMaster.deployed();
  const _oracle_master = OM.address;

  console.log(`Deploying Oracle`);
  await deployer.deploy(Oracle);
  let OR = await Oracle.deployed();
  const _oracle = OR.address;

  console.log(`Deploying DepositStaking`)
  await deployer.deploy(DepositStaking);
  const DS = await DepositStaking.deployed()
  const _deposit_staking = DS.address;

  console.log(`Deploying InactivityCover`);
  await deployer.deploy(InactivityCover);
  const IC = await InactivityCover.deployed();
  const _inactivity_cover = IC.address;

  console.log(`Initializing OracleMaster`);
  await OM.initialize(
    _auth_manager,
    _oracle,
    _inactivity_cover,
    _quorum,
  );

  console.log(`Initializing Oracle`);
  await OR.initialize(_oracle_master, _inactivity_cover);

  console.log(`Initializing DepositStaking`);
  await DS.initialize(_auth_manager, _inactivity_cover);

  console.log(`Initializing InactivityCover`);
  await IC.initialize(
    _auth_manager,
    _oracle_master,
    _deposit_staking,
    _min_deposit,
    _max_deposit_total,
    _stake_unit_cover,
    _min_payout,
    _eras_between_forced_undelegation
  );

  console.log('Finished deploying and intializing contracts')
  console.log({
    _auth_manager,
    _oracle,
    _oracle_master,
    _inactivity_cover
  })

  console.log({accounts})

};
