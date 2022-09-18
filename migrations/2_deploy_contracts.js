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
  const oracleMembersManager = accounts[2]
  const oracleMember = accounts[3]
  console.log(`Superior is ${superior}`);

  console.log(`Deploying AuthManager`);
  let _auth_manager, AM;
  while (true) {
    try {
      await deployer.deploy(AuthManager);
      AM = await AuthManager.deployed();
      _auth_manager = AM.address;
      break;
    } catch { }
  }

  console.log(`Initializing AuthManager`);
  await AM.initialize(superior);

  console.log(`Adding manager role ${manager}`)
  //const managerHash = web3.utils.sha3('ROLE_MANAGER', { encoding: 'hex' })
  await AM.addByString('ROLE_MANAGER', manager);
  await AM.addByString('ROLE_ORACLE_MEMBERS_MANAGER', oracleMembersManager);

  console.log(`Deploying OracleMaster`);
  let _oracle_master, OM;
  while (true) {
    try {
      await deployer.deploy(OracleMaster);
      OM = await OracleMaster.deployed();
      _oracle_master = OM.address;
      break
    } catch { }
  }

  console.log(`Deploying Oracle`);
  let _oracle, OR;
  while (true) {
    try {
      await deployer.deploy(Oracle);
      OR = await Oracle.deployed();
      _oracle = OR.address;
      break;
    } catch { }
  }

  console.log(`Deploying DepositStaking`)
  let _deposit_staking, DS;
  while (true) {
    try {
      await deployer.deploy(DepositStaking);
      DS = await DepositStaking.deployed()
      _deposit_staking = DS.address;
      break;
    } catch { }
  }

  console.log(`Deploying InactivityCover`);
  let _inactivity_cover, IC;
  while (true) {
    try {
      await deployer.deploy(InactivityCover);
      IC = await InactivityCover.deployed();
      _inactivity_cover = IC.address;
      break;
    } catch { }
  }

  console.log(`Initializing OracleMaster`);
  await OM.initialize(
    _auth_manager,
    _oracle,
    _inactivity_cover,
    _quorum,
  );
  await OM.addOracleMember(oracleMember, { from: oracleMembersManager });

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
    _inactivity_cover,
    _deposit_staking
  })

  console.log({ accounts })

};
