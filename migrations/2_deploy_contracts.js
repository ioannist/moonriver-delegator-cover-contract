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
  const _min_payout = web3.utils.toWei(process.env.MIN_PAYOUT, "wei");
  const _eras_between_forced_undelegation = process.env.ERAS_BETWEEN_FORCED_UNDELEGATION;
  const _max_era_member_payout = web3.utils.toWei(process.env.MAX_ERA_MEMBER_PAYOUT, "ether");
  const _quorum = process.env.QUORUM;

  const superior = accounts[0];
  const manager = accounts[1];
  const oracleMembersManager = accounts[2]
  const oracleMember = accounts[3]
  const stakingManager = accounts[2]
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
  await AM.initialize({from: superior});

  console.log(`Adding manager role ${manager}`)
  //const managerHash = web3.utils.sha3('ROLE_MANAGER', { encoding: 'hex' })
  await AM.addByString('ROLE_MANAGER', manager);
  await AM.addByString('ROLE_ORACLE_MEMBERS_MANAGER', oracleMembersManager);
  await AM.addByString('ROLE_PAUSE_MANAGER', oracleMembersManager);
  await AM.addByString('ROLE_ORACLE_QUORUM_MANAGER', oracleMembersManager);
  await AM.addByString('ROLE_STAKING_MANAGER', stakingManager);

  // replenish balancesif low
  for (const a of accounts) {
    console.log(`Sending DEV to ${a}`);
    await web3.eth.sendTransaction({ to: a, from: manager, value: web3.utils.toWei("1", "ether") });
  }

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
  await OM.addOracleMember(oracleMember, oracleMember, { from: oracleMembersManager, gas: 10000000 });

  console.log(`Initializing Oracle`);
  await OR.initialize(_oracle_master, _inactivity_cover); // TODO, change first pushed eraId
  
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
    _max_era_member_payout,
    _eras_between_forced_undelegation
  );
  console.log('Finished deploying and intializing contracts')

  //console.log('Whitelist the first collator to join')
  //const _collator = process.env.FIRST_COLLATOR_MEMBER
  //await IC.whitelist(_collator, true, { from: manager, gas: 10000000 });
  //console.log("Make deposit for the first collator member")
  //const _collator_deposit = web3.utils.toWei(process.env.FIRST_COLLATOR_DEPOSIT, "ether");
  //await IC.depositCover(_collator, { from: manager, value: _collator_deposit, gas: 10000000 });

  console.log("Contracts created:")
  console.log({
    _auth_manager,
    _oracle,
    _oracle_master,
    _inactivity_cover,
    _deposit_staking
  })
  console.log("Accounts used:")
  console.log({ accounts })



};
