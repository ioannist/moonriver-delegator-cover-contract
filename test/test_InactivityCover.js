// Example test script - Uses Mocha and Ganache
const AuthManager = artifacts.require("AuthManager");
const InactivityCover = artifacts.require("InactivityCover_mock");
const Oracle = artifacts.require("Oracle");
const OracleMaster = artifacts.require("OracleMaster_mock");
const DepositStaking = artifacts.require("DepositStaking_mock");

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
const { assert } = require("chai");
// chai.use(chaiAsPromised);

const BN = require('bn.js');
const chaiBN = require("chai-bn")(BN);
chai.use(chaiBN);

const chaiAlmost = require('chai-almost');
chai.use(chaiAlmost(0.01));

const expect = chai.expect;

contract('InactivityCover', accounts => {

    /*
    TODO
    * Set which collators we want in oracle info for to save tx costs
    * Test if >2/3 of collators have 0 points, do nothing
    * Test manager trying to withdraw deposits
    */

    let am;
    let ic;
    let or;
    let om;
    let ds;

    const superior = accounts[0];
    const dev = accounts[1];
    const manager = accounts[2];
    const member1 = accounts[3]
    const member2 = accounts[4]
    const delegator1 = accounts[5]
    const delegator2 = accounts[6]
    const oracleManager = accounts[7]
    const stakingManager = accounts[7]

    require('dotenv').config()
    const _min_deposit = web3.utils.toWei(process.env.MIN_DEPOSIT, "ether");
    const _max_deposit_total = web3.utils.toWei(process.env.MAX_DEPOSIT_TOTAL, "ether");
    const _stake_unit_cover = web3.utils.toWei(process.env.STAKE_UNIT_COVER, "wei");
    const _min_payout = web3.utils.toWei(process.env.MIN_PAYOUT, "wei"); // practically no min payment
    const _eras_between_forced_undelegation = process.env.ERAS_BETWEEN_FORCED_UNDELEGATION;
    const _max_era_member_payout = web3.utils.toWei(process.env.MAX_ERA_MEMBER_PAYOUT, "ether");
    const _quorum = process.env.QUORUM;
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const ONE_ADDR = "0x0000000000000000000000000000000000000001";
    const TWO_ADDR = "0x0000000000000000000000000000000000000002";
    const THREE_ADDR = "0x0000000000000000000000000000000000000003";
    const zero = new BN("0")
    const payoutReversed = false;

    function bnToEther(bignumber) {
        return new BN(bignumber).div(new BN(web3.utils.toWei("1", "ether"))).toNumber()
    }

    const topActiveDelegations1 = [{
        ownerAccount: delegator1,
        amount: web3.utils.toWei("1000", "ether")
    }, {
        ownerAccount: delegator2,
        amount: web3.utils.toWei("200", "ether")
    }]
    const topActiveDelegations2 = [{
        ownerAccount: delegator1,
        amount: web3.utils.toWei("150", "ether")
    }]
    const topActiveDelegations300 = new Array(600).fill({
        ownerAccount: delegator1,
        amount: web3.utils.toWei("1", "ether")
    })
    const collators = [{
        collatorAccount: member1,
        points: "0",
        active: true,
        bond: web3.utils.toWei("500", "ether"),
        delegationsTotal: web3.utils.toWei("25000", "ether"),
        topActiveDelegations: topActiveDelegations1
    }, {
        collatorAccount: member2,
        points: "120",
        active: true,
        bond: web3.utils.toWei("500", "ether"),
        delegationsTotal: web3.utils.toWei("20000", "ether"),
        topActiveDelegations: topActiveDelegations2
    }];
    const oracleData = {
        totalStaked: web3.utils.toWei("2000000", "ether"),
        totalSelected: "64",
        orbitersCount: "4",
        round: "4",
        blockHash: "0xe945e12dbf7011bd8dd4ba1381abcab90289ea265c021442337f063c4a54caae",
        blockNumber: "2000000",
        awarded: "1500",
        collators
    }

    beforeEach(async () => {

        // replenish balancesif low
        await web3.eth.sendTransaction({ to: superior, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: manager, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: member1, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: member2, from: dev, value: web3.utils.toWei("1000", "ether") });
        await web3.eth.sendTransaction({ to: oracleManager, from: dev, value: web3.utils.toWei("1000", "ether") });


        am = await AuthManager.new();
        assert.ok(am);
        await am.initialize(superior);
        await am.addByString('ROLE_MANAGER', manager);
        await am.addByString('ROLE_ORACLE_MEMBERS_MANAGER', oracleManager);
        await am.addByString('ROLE_ORACLE_QUORUM_MANAGER', oracleManager);
        await am.addByString('ROLE_STAKING_MANAGER', stakingManager);
        await am.addByString('ROLE_PAUSE_MANAGER', oracleManager);

        ic = await InactivityCover.new();
        assert.ok(ic);
        or = await Oracle.new();
        assert.ok(or);
        om = await OracleMaster.new();
        assert.ok(om);
        ds = await DepositStaking.new();
        assert.ok(ds);

        console.log(`Initializing OracleMaster`);
        await om.initialize(
            am.address,
            or.address,
            ic.address,
            _quorum,
        );

        console.log(`Initializing Oracle`);
        await or.initialize(om.address, ic.address);

        console.log(`Initializing DepositStaking`);
        await ds.initialize(am.address, ic.address);

        console.log(`Initializing InactivityCover`);
        await ic.initialize(
            am.address,
            om.address,
            ds.address,
            _min_deposit,
            _max_deposit_total,
            _stake_unit_cover,
            _min_payout,
            _max_era_member_payout,
            _eras_between_forced_undelegation,
        );
        await ic.setMinPayout(0, { from: manager });
    });

    async function getDeposit(member) {
        const { 2: deposit } = await ic.getMember(member);
        return deposit;
    }

    async function getIsMember(member) {
        const { 0: isMember } = await ic.getMember(member);
        return isMember;
    }

    async function getIsActive(member) {
        const { 1: active } = await ic.getMember(member);
        return active;
    }

    async function getMaxDefault(member) {
        const { 3: maxDefaulted } = await ic.getMember(member);
        return maxDefaulted;
    }

    async function getMaxCoveredDelegation(member) {
        const { 4: maxCoveredDelegation } = await ic.getMember(member);
        return maxCoveredDelegation;
    }

    it("oracle reports are not pushed due to veto", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        const oracleData2 = {
            ...oracleData,
            collators: [oracleData.collators[1]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });
        await om.addOracleMember(manager, manager, { from: oracleManager });
        await om.setVetoOracleMember(manager, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(manager, newEra, 0, oracleData2, { from: manager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
    })

    it("oracle reports are not pushed due to veto (2)", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        const oracleData2 = {
            ...oracleData,
            collators: [oracleData.collators[1]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });
        await om.addOracleMember(manager, manager, { from: oracleManager });
        await om.setVetoOracleMember(manager, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(manager, newEra, 0, oracleData2, { from: manager });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
    })

    it("oracle reports are not pushed even though veto comes after quorum was reached (waiting for veto address to report)", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });
        await om.addOracleMember(manager, manager, { from: oracleManager });
        await om.setVetoOracleMember(manager, { from: oracleManager });
        await om.setLastEraVetoOracleVoted_mock(newEra);

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
    })

    it("oracle reports are pushed because veto comes after quorum was reached and veto has not reported for 3 eras", async () => {
        const newEra = new BN("222"); const nextEra = new BN("228");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });
        await om.addOracleMember(manager, manager, { from: oracleManager });
        await om.setVetoOracleMember(manager, { from: oracleManager });
        await om.setLastEraVetoOracleVoted_mock(newEra);
        await om.setEra_mock(nextEra);

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, nextEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member2, nextEra, 0, oracleData1, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1")); // nonce increment means quorum was reached
    })


    it("manager cannot withdraw an amount larger than the staking rewards w/ report event", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const extraAmount = web3.utils.toWei("1", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member2, member2, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await expect(ic.withdrawRewards(new BN(rewards).add(new BN(extraAmount)), manager, { from: manager }))
            .to.be.rejectedWith("NO_REWARDS");
    })

    it("manager cannot withdraw an amount larger than the staking rewards w/ cover decrease event", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const extraAmount = web3.utils.toWei("1", "ether");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member2, member2, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member1 });
        await expect(ic.withdrawRewards(new BN(rewards).add(new BN(extraAmount)), manager, { from: manager }))
            .to.be.rejectedWith("NO_REWARDS");
    })

    it("manager can withdraw staking rewards w/ delegation event", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const delegation = web3.utils.toWei("2", "ether");
        const withdrawal = new BN(rewards).sub(new BN("1")).sub(new BN(delegation));
        const newEra = new BN("222");
        const candidate = member1;

        const candidateDelegationCount = "150";
        const delegatorDelegationCount = "1";
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member2, member2, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        const balanceStart = new BN(await web3.eth.getBalance(dev));
        await ic.withdrawRewards(withdrawal, dev, { from: manager });
        const balanceEnd = new BN(await web3.eth.getBalance(dev));
        return expect(balanceEnd.sub(balanceStart)).to.be.bignumber.equal(withdrawal);
    })

    it("manager cannot withdraw an amount larger than the staking rewards w/ delegation event", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const delegation = new BN(deposit).add(new BN(rewards)).sub(new BN("1000"));
        const withdrawal = new BN(rewards).sub(new BN("1"));
        const newEra = new BN("222");
        const candidate = member1;

        const candidateDelegationCount = "100";
        const delegatorDelegationCount = "100";
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        console.log(`balance before delegate ${await web3.eth.getBalance(ic.address)}`)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        console.log(`balance after delegate ${await web3.eth.getBalance(ic.address)}`)

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), manager, { from: manager }))
            .to.be.rejectedWith("NO_FUNDS");
    })

    it("manager can withdraw staking rewards w/ delegation event (2)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const delegation = new BN(deposit);
        const withdrawal = new BN(rewards).sub(new BN(web3.utils.toWei("1", "ether")));
        const newEra = new BN("222");
        const candidate = member1;

        const candidateDelegationCount = "100";
        const delegatorDelegationCount = "100";
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        console.log(`balance before delegate ${await web3.eth.getBalance(ic.address)}`)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        console.log(`balance after delegate ${await web3.eth.getBalance(ic.address)}`)

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.withdrawRewards(new BN(withdrawal), manager, { from: manager });
    })

    it("manager cannot withdraw an amount larger than the staking rewards w/ delegation and undelegation event", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const delegation = new BN(deposit).add(new BN(rewards)).sub(new BN("1000"));
        const withdrawal = new BN(rewards).sub(new BN("1"));
        const newEra = new BN("222");
        const candidate = member1;

        const candidateDelegationCount = "100";
        const delegatorDelegationCount = "100";
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        await ds.scheduleDelegatorRevoke(candidate, { from: stakingManager });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), manager, { from: manager }))
            .to.be.rejectedWith("NO_FUNDS");
    })

    it("manager cannot withdraw an amount larger than the staking rewards w/ delegation and undelegation event (2)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const delegation = new BN(deposit).add(new BN(rewards)).sub(new BN("1000"));
        const withdrawal = new BN(rewards).sub(new BN("1"));
        const less = web3.utils.toWei("20", "ether")
        const newEra = new BN("222");
        const candidate = member1;

        const candidateDelegationCount = "100";
        const delegatorDelegationCount = "100";
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        await ds.scheduleDelegatorBondLess(candidate, less, { from: stakingManager });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), manager, { from: manager }))
            .to.be.rejectedWith("NO_FUNDS");
    })

    it("manager cannot withdraw an amount larger than the staking rewards w/ delegation and undelegation event (3)", async () => {
        const deposit = web3.utils.toWei("150", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const delegation = new BN(web3.utils.toWei("130", "ether"));
        const withdrawal = new BN(rewards).sub(new BN("1"));
        const less = web3.utils.toWei("20", "ether")
        const newEra = new BN("222");
        const candidate = member1;

        const candidateDelegationCount = "100";
        const delegatorDelegationCount = "100";
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        await ds.scheduleDelegatorBondLess(candidate, less, { from: stakingManager });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), manager, { from: manager }))
            .to.be.rejectedWith("NO_REWARDS");
    })

    it("reducing quorum size results in softenQuorum and automatic pushing of report", async () => {
        const newEra = new BN("222");
        await om.setQuorum("3", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });
        await om.addOracleMember(dev, dev, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member2, newEra, 0, oracleData, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.setQuorum("2", { from: oracleManager })
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1"));
    })


    it("manager can add oracle member while sudo is true", async () => {
        await om.addOracleMember(member1, member1, { from: oracleManager });
        expect(await om.members(0, { from: dev })).to.be.equal(member1);
    })

    it("manager can remove oracle member while sudo is true", async () => {
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.removeOracleMember(member1, member1, { from: oracleManager });
        return await expect(om.members(0, { from: dev })).to.be.rejected;
    })

    it("manager cannot add oracle member twice", async () => {
        await om.addOracleMember(member1, member1, { from: oracleManager });
        return await expect(om.addOracleMember(member1, member1, { from: oracleManager })).to.be.rejectedWith("OM: MEMBER_EXISTS");
    })

    it("manager cannot add oracle member after sudo is removed", async () => {
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        return await expect(om.addOracleMember(member1, member1, { from: oracleManager })).to.be.rejectedWith("OM: N_SUDO");
    })


    it("manager cannot remove oracle member after sudo is removed", async () => {
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        return await expect(om.removeOracleMember(member1, member1, { from: oracleManager })).to.be.rejectedWith("OM: N_SUDO");
    })

    it("a collator can register an oracle", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: member1 });
        return expect(await om.members(0, { from: dev })).to.be.equal(member1);
    })

    it("a collator cannot register an oracle when no proxy precomp", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await ic.setSimulateNoProxySupport_mock(true);
        await om.setSimulateNoProxySupport_mock(true);
        return await expect(om.registerAsOracleMember(collator, { from: member1 })).to.be.rejectedWith('CANNOT_CALL_PROXY_PRECOMP_FROM_SC');

    })

    it("a collator can unregister their oracle and register a new one", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: member1 });
        await om.unregisterOracleMember(member1, collator, { from: member1 }); // any from address can be used here, but in mainnet it will have to be a Gov proxy of the collator
        await expect(om.members(0, { from: dev })).to.be.rejected;
        await om.registerAsOracleMember(collator, { from: member2 });
    })

    it("a collator cannot register the same address twice", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: member1 });
        return await expect(om.registerAsOracleMember(collator, { from: member1 })).to.be.rejectedWith("OM: MEMBER_EXISTS");
    })

    it("a collator cannot register an address that is used by another collator (this assumes two collators have the priv key of that address, i.e. one entity runs multiple collators)", async () => {
        const collator = TWO_ADDR;
        const collator2 = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: member1 });
        return await expect(om.registerAsOracleMember(collator2, { from: member1 })).to.be.rejectedWith("OM: MEMBER_EXISTS");
    })

    it("a collator cannot register two addresses", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: member1 });
        return await expect(om.registerAsOracleMember(collator, { from: member2 })).to.be.rejectedWith("OM: COLLATOR_REGISTERED");
    })

    it("must offer at least one cover (active-set or zero-points)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.memberSetCoverTypes(member1, false, false, { from: member1 })).to.be.rejectedWith('INV_COVER');
    })

    it("can offer both covers (active-set and zero-points)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.memberSetCoverTypes(member1, true, true, { from: member1 });
    })

    it("oracle reports 0 points for collator that is not offering 0-pts-cover", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const payoutsOwedTotal1 = new BN("0");
        const payoutsOwedTotal2 = new BN("0");
        const startEra = 221;

        await ic.setEra_mock(startEra); // go to era 221
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.memberSetCoverTypes(member1, true, false, { from: member1 }); // deactivate zero-pts cover
        const newEra = startEra + 138 + 1; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        const executeDelayB = await ic.getErasCovered(member1, { from: dev });
        console.log({ executeDelayB: executeDelayB.toString() }) //  this is were we get the 138 from
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return await expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for collator that is not offering active-set-cover", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const payoutsOwedTotal1 = new BN("0");
        const payoutsOwedTotal2 = new BN("0");
        const startEra = 221;
        const oracleData1 = {
            ...oracleData,
            collators: [{
                ...oracleData.collators[1],
                active: false
            }]
        }

        await ic.setEra_mock(startEra); // go to era 221
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.memberSetCoverTypes(member1, false, true, { from: member1 }); // deactivate zero-pts cover
        const newEra = startEra + 138 + 1; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        const executeDelayB = await ic.getErasCovered(member1, { from: dev });
        console.log({ executeDelayB: executeDelayB.toString() }) //  this is were we get the 138 from
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for collator that is not offering active-set-cover", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const startEra = 221;
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.setEra_mock("221"); // go to era 221
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.memberSetCoverTypes(member1, false, true, { from: member1 }); // deactivate zero-pts cover
        const executeDelay = await ic.getErasCovered(member1, { from: dev });
        console.log({ executeDelay: executeDelay.toString() })
        await ic.timetravel(1 + executeDelay); // move to an era where zero-pts cover is now deactivated
        const newEra = startEra + 1 + executeDelay;

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for collator that is not offering 0-pts-cover, but the setting has not yet been effected", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const startEra = 221;

        await ic.setEra_mock(startEra); // go to era 221
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.memberSetCoverTypes(member1, false, true, { from: member1 }); // deactivate zero-pts cover
        const newEra = startEra + 20; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        const executeDelayB = await ic.getErasCovered(member1, { from: dev });
        console.log({ executeDelayB: executeDelayB.toString() }) //  we get 138, and we make sure 20 < 138
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for collator that is not offering active-set-cover, but the setting has not yet been effected", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations2[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const startEra = 221;
        const oracleData1 = {
            ...oracleData,
            collators: [{
                ...oracleData.collators[1],
                active: false
            }]
        }

        await ic.setEra_mock(startEra); // go to era 221
        await ic.whitelist(member2, member2, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit });
        await ic.memberSetCoverTypes(member2, true, false, { from: member2 }); // deactivate zero-pts cover
        const newEra = startEra + 20; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1);
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        const executeDelayB = await ic.getErasCovered(member2, { from: dev });
        console.log({ executeDelayB: executeDelayB.toString() }) //  we get 138, and we make sure 20 < 138
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member2)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle data cannot be pushed twice for same collator, in quorum of 2", async () => {
        const newEra = new BN("222");
        const deposit = web3.utils.toWei("120", "ether");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });
        await ic.whitelist(TWO_ADDR, member1, { from: manager });
        await ic.depositCover(TWO_ADDR, { from: member1, value: deposit });
        await ic.whitelist(THREE_ADDR, member2, { from: manager });
        await ic.depositCover(THREE_ADDR, { from: member2, value: deposit });

        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: member2 });
        await om.reportPara(member1, newEra, 1, oracleData1, { from: member1 });
        return expect(om.reportPara(member2, newEra, 1, oracleData1, { from: member2 })).to.be.rejectedWith('OLD_MEMBER_ERA');
    })

    it("oracle data can be pushed twice for different collators", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        const oracleData2 = {
            ...oracleData,
            collators: [oracleData.collators[1]]
        }
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member1, newEra, 1, oracleData2, { from: member1 });
        return expect(await om.eraId()).to.be.bignumber.equal(newEra);
    })

    it("oracle data cannot be pushed twice by the same member", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        return await expect(om.reportPara(member1, newEra, 0, oracleData1, { from: member1 })).to.be.rejectedWith('OR: INV_NONCE');
    })

    it("oracle data cannot be pushed twice for same collator", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        return await expect(om.reportPara(member1, newEra, 1, oracleData1, { from: member1 })).to.be.rejectedWith('OLD_MEMBER_ERA');
    })



    it("oracle data cannot be pushed twice until quorum reached", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        return await expect(om.reportPara(member1, newEra, 0, oracleData1, { from: member1 })).to.be.rejectedWith('OR: ALREADY_SUBMITTED');
    })

    it("oracle quorum of 2 reports two parts, eraNonce is updated correctly", async () => {
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1"));
        await om.reportPara(member1, newEra2, 1, oracleData1, { from: member1 });
        await om.reportPara(member2, newEra2, 1, oracleData1, { from: member2 });
        return expect(await or.eraNonce()).to.be.bignumber.equal(new BN("2"));
    })

    it("oracle reports four parts over two rounds, eraNonce is updated correctly", async () => {
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        const oracleData2 = {
            ...oracleData,
            collators: [oracleData.collators[1]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.addOracleMember(member2, member2, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1"));
        await om.reportPara(member1, newEra, 1, oracleData2, { from: member1 });
        await om.reportPara(member2, newEra, 1, oracleData2, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("2"));
        await om.reportPara(member1, newEra2, 2, oracleData2, { from: member1 });
        await om.reportPara(member2, newEra2, 2, oracleData2, { from: member2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("3"));
        await om.reportPara(member1, newEra2, 3, oracleData1, { from: member1 });
        await om.reportPara(member2, newEra2, 3, oracleData1, { from: member2 });
        return expect(await or.eraNonce()).to.be.bignumber.equal(new BN("4"));
    })

    it("next part cannot be pushed until quorum reached for first part", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        const oracleData2 = {
            ...oracleData,
            collators: [oracleData.collators[1]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        return await expect(om.reportPara(member1, newEra, 1, oracleData2, { from: member1 })).to.be.rejectedWith('OR: ALREADY_SUBMITTED');
    })

    it("oracle data can be pushed for subsequent eras", async () => {
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        const oracleData2 = {
            ...oracleData,
            collators: [oracleData.collators[1]]
        }
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: member1 });
        await om.reportPara(member1, newEra, 1, oracleData2, { from: member1 });
        await expect(await om.eraId()).to.be.bignumber.equal(newEra);
        await om.reportPara(member1, newEra2, 2, oracleData1, { from: member1 });
        await om.reportPara(member1, newEra2, 3, oracleData2, { from: member1 });
        return expect(await om.eraId()).to.be.bignumber.equal(newEra2);
    })

    it("oracle pushes report for collator with >300 delegators (gas check); no refund as gas price is set to 0", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        const collators300 = [{
            collatorAccount: member1,
            points: "0",
            active: true,
            bond: web3.utils.toWei("500", "ether"),
            delegationsTotal: web3.utils.toWei("25000", "ether"),
            topActiveDelegations: topActiveDelegations300
        }];
        const oracleDataThis = {
            ...oracleData,
            collators: collators300
        }

        await om.addOracleMember(member2, member2, { from: oracleManager });
        await om.reportPara(member2, newEra, 0, oracleDataThis, { from: member2, gas: "10000000" });
        return expect(await ic.payoutAmounts(member2)).to.be.bignumber.equal(new BN("0"));
    })

    it("oracle pushes report for collator with >300 delegators and gets the loop tx cost refunded", async () => {
        const deposit = web3.utils.toWei("500", "ether");
        const newEra = new BN("222");

        await ic.setRefundOracleGasPrice(new BN("9000000000"), { from: manager });
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        const collators300 = [{
            collatorAccount: member1,
            points: "0",
            active: true,
            bond: web3.utils.toWei("500", "ether"),
            delegationsTotal: web3.utils.toWei("25000", "ether"),
            topActiveDelegations: topActiveDelegations300
        }];
        const oracleDataThis = {
            ...oracleData,
            collators: collators300
        }

        await om.addOracleMember(member2, member2, { from: oracleManager });
        await om.reportPara(member2, newEra, 0, oracleDataThis, { from: member2, gas: "10000000" });
        return expect(await ic.payoutAmounts(member2)).to.be.bignumber.above(new BN("0"));
    })

    it("have all variables initialized", async () => {
        expect(await om.QUORUM()).to.be.bignumber.equal(_quorum);
        expect(await ic.MIN_DEPOSIT()).to.be.bignumber.equal(_min_deposit);
        expect(await ic.MAX_DEPOSIT_TOTAL()).to.be.bignumber.equal(_max_deposit_total);
        expect(await ic.STAKE_UNIT_COVER()).to.be.bignumber.equal(_stake_unit_cover);
        expect(await ic.MIN_PAYOUT()).to.be.bignumber.equal(zero);
        return expect(await ic.ERAS_BETWEEN_FORCED_UNDELEGATION()).to.be.bignumber.equal(_eras_between_forced_undelegation);
    });

    it("contracts are connected", async () => {
        expect(await om.INACTIVITY_COVER()).to.be.equal(ic.address);
        expect(await om.ORACLE()).to.be.equal(or.address);
        expect(await om.AUTH_MANAGER()).to.be.equal(am.address);
        expect(await or.ORACLE_MASTER()).to.be.equal(om.address);
        expect(await or.PUSHABLES(0)).to.be.equal(ic.address);
        expect(await ds.AUTH_MANAGER()).to.be.equal(am.address);
        expect(await ds.INACTIVITY_COVER()).to.be.equal(ic.address);
        expect(await ic.AUTH_MANAGER()).to.be.equal(am.address);
        expect(await ic.ORACLE_MASTER()).to.be.equal(om.address);
        return expect(await ic.DEPOSIT_STAKING()).to.be.equal(ds.address);
    });

    it("whitelisted member collator makes a deposit which results to a member entry", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        expect(await getDeposit(member1)).to.be.bignumber.equal(deposit);
        expect(await getIsMember(member1)).to.be.true;
        return expect(await getMaxDefault(member1)).to.be.bignumber.equal(zero);
    })

    it("non-whitelisted collator cannot make a deposit, with proxy precompile accesible", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.setIsProxySelectedCandidate_mock(false);
        await ic.setSimulateNoProxySupport_mock(false);
        await expect(ic.depositCover(member1, { from: member1, value: deposit })).to.be.rejectedWith('N_COLLATOR_PROXY');
        expect(await getDeposit(member1)).to.be.bignumber.equal("0");
        expect(await getIsMember(member1)).to.be.equal(false);
        return expect(await getMaxDefault(member1)).to.be.bignumber.equal(zero);
    })

    it("non-whitelisted collator cannot make a deposit, with NoManualWhitelistingRequired=true and proxy precompile not accessible", async () => {
        await ic.setSimulateNoProxySupport_mock(true);
        await om.setSimulateNoProxySupport_mock(true);
        const deposit = web3.utils.toWei("10", "ether");
        await ic.setIsProxySelectedCandidate_mock(false);
        await ic.setSimulateNoProxySupport_mock(true);
        await ic.setNoManualWhitelistingRequired(true, { from: manager });
        await expect(ic.depositCover(member1, { from: member1, value: deposit })).to.be.rejectedWith('CANNOT_CALL_PROXY_PRECOMP_FROM_SC');
        expect(await getDeposit(member1)).to.be.bignumber.equal("0");
        expect(await getIsMember(member1)).to.be.equal(false);
        return expect(await getMaxDefault(member1)).to.be.bignumber.equal(zero);
    })

    it("member cannot make a deposit that is under min deposit", async () => {
        await ic.whitelist(member1, member1, { from: manager });
        const lessThanMinDeposit = web3.utils.toWei((1000 * process.env.MIN_DEPOSIT - 500).toString(), "milli")
        await expect(ic.depositCover(member1, { from: member1, value: lessThanMinDeposit })).to.be.rejectedWith('BEL_MIN_DEP');
    })

    it("member cannot make a despoit that is above max deposit", async () => {
        await ic.whitelist(member1, member1, { from: manager });
        const moreThanMinDeposit = web3.utils.toWei((1000 * process.env.MAX_DEPOSIT_TOTAL + 500).toString(), "milli")
        await expect(ic.depositCover(member1, { from: member1, value: moreThanMinDeposit })).to.be.rejectedWith('EXC_MAX_DEP');
    })

    it("member makes 2 deposits", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const deposit2 = web3.utils.toWei("15", "ether");
        const expected = web3.utils.toWei("25", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.depositCover(member1, { from: member1, value: deposit2 });
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        expect(await getIsMember(member1)).to.be.true;
        return expect(await getMaxDefault(member1)).to.be.bignumber.equal(zero);
    })

    /*it("member makes a deposit, then they are removed from whitelist; they cannot make another deposit", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await expect(ic.depositCover(member1, { from: member1, value: deposit })).to.be.rejectedWith('N_COLLATOR_PROXY');
    })*/

    it("member schedules a cover decrease; check that deposit is not affected", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(zero);
        expect(amount).to.be.bignumber.equal(new BN(decrease));
        expect(await getDeposit(member1)).to.be.bignumber.equal(deposit);
        expect(await getIsMember(member1)).to.be.true;
        return expect(await getMaxDefault(member1)).to.be.bignumber.equal(zero);
    })

    it("member cannot schedule a decrease if they have never made a deposit", async () => {
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1 })).to.be.rejectedWith('NO_DEP');
    })

    it("member cannot schedule a decrease for more than their deposit amount", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("15", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1 })).to.be.rejectedWith('EXC_DEP');
    })

    it("member cannot schedule a 0 decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("0", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1 })).to.be.rejectedWith('ZERO_DECR');
    })

    /*it("non-whitelisted member can still schedule a decrease to protect members from having their deposits locked", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(zero);
        expect(amount).to.be.bignumber.equal(new BN(decrease));
    })*/

    it("member cannot schedule a second increase while a decrease is pending", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1 })).to.be.rejectedWith('DECR_EXIST');
    })

    it("member can cancel a scheduled decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.cancelDecreaseCover(member1, { from: member1 });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(zero);
        return expect(amount).to.be.bignumber.equal(zero);
    })

    it("member can execute a scheduled decrease; deposit is updated and funds are withdrawn", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member1 });
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        return expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
        //expect(bnToEther(await web3.eth.getBalance(member1))).to.almost.equal(bnToEther(balanceEndExpected.toString()));
    })

    it("anyone can execute a member's scheduled decrease", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("20", "ether");
        const decrease = web3.utils.toWei("13", "ether");
        const expected = web3.utils.toWei("7", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member2 });
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        return expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
    })

    it("member cannot execute a scheduled decrease early", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('NOT_EXEC');
    })

    it("member cannot execute a scheduled decrease early (2)", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("20");
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('NOT_EXEC');
    })

    /*it("member cannot execute a scheduled decrease when their delay is not set", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("40");
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('DEL_N_SET');
    })*/

    it("member cannot execute a scheduled decrease if they never scheduled one", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member cannot cancel a scheduled decrease if they never scheduled one", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.cancelDecreaseCover(member1, { from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member can execute a scheduled decrease early, if execute delay is updated to allow it", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("20");
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('NOT_EXEC');
        await ic.setErasCovered("18", member1, { from: manager });
        await ic.executeScheduled(member1, { from: member2 });
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        return expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
    })

    it("member cannot execute a cancelled decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.cancelDecreaseCover(member1, { from: member1 });
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member cannot execute a decrease when reducible balance is not enough; memberNotPaid is set", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const transfer = web3.utils.toWei("9", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.transfer_mock(dev, transfer);
        await ic.executeScheduled(member1, { from: member1 }); // fails silently; there is no DecreaseCoverEvent event
        return expect(await ic.memberNotPaid()).to.be.equal(member1);
    })

    it("member cannot cancel a decrease that is already cancelled", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.cancelDecreaseCover(member1, { from: member1 });
        await expect(ic.cancelDecreaseCover(member1, { from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    /*it("non-whitelisted member can still execute a scheduled decrease", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.whitelist(member1, false, { from: manager });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member2 });
        await expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        await expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
    })*/

    it("oracle data can be pushed and era is updated", async () => {
        const newEra = new BN("222");
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        return expect(await om.eraId()).to.be.bignumber.equal(newEra);
    })



    it("oracle reports 0 points for collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for collator but fails due to payout being higher than maxEraMemberPayout", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const maxMemberPayout = payoutsOwedTotal1.add(payoutsOwedTotal2).sub(new BN("1")); // a bit less than the total payout

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.setMaxEraMemberPayout(maxMemberPayout, { from: manager });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        return expect(om.reportPara(member1, newEra, 0, oracleData, { from: member1 })).to.be.rejectedWith('EXCEEDS_MAX');
    })

    it("oracle reports 0 points for a non-member collator; check not affected for payout amounts, deposits, total deposit, and cover owed", async () => {
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(zero);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(zero);
    })

    /*it("oracle reports 0 points for a dewhitelisted collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await ic.whitelist(member1, false, { from: manager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        await expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        await expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        await expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        await expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })*/

    it("oracle reports 0 points for a collator and X>0 points for another member collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member2, member2, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports positive points for 2 collators; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");


        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member2, member2, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit });
        const membersDepositTotalexpected = await ic.membersDepositTotal();
        const depositExpected = new BN(deposit);

        const collatorsOK = [{
            collatorAccount: member1,
            points: "140",
            active: true,
            bond: web3.utils.toWei("500", "ether"),
            delegationsTotal: web3.utils.toWei("25000", "ether"),
            topActiveDelegations: topActiveDelegations1
        }, {
            collatorAccount: member2,
            points: "120",
            active: true,
            bond: web3.utils.toWei("500", "ether"),
            delegationsTotal: web3.utils.toWei("20000", "ether"),
            topActiveDelegations: topActiveDelegations2
        }];
        const oracleDataThis = {
            ...oracleData,
            collators: collatorsOK
        }

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleDataThis, { from: member1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports not-active for collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        const collatorsNotActive = [{
            collatorAccount: member1,
            points: "0",
            active: false,
            bond: web3.utils.toWei("500", "ether"),
            delegationsTotal: web3.utils.toWei("25000", "ether"),
            topActiveDelegations: topActiveDelegations1
        }];
        const oracleDataThis = {
            ...oracleData,
            collators: collatorsNotActive
        }

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleDataThis, { from: member1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for a collator but the reducible balance is not enough; delegatorNotpaid is set", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.transfer_mock(dev, deposit); // send all the funds away 

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1]);
        expect(await ic.delegatorNotPaid()).to.be.equal(delegator1);
        return expect(await getMaxDefault(member1)).to.be.bignumber.equal(zero); // default is not affected by reducible default
    })

    it("when delegatorNotpaid is set, it does not change when another delegator does not get paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.setDelegatorNotPaid_mock(delegator2);
        await ic.transfer_mock(dev, deposit); // send all the funds away

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1]);
        return expect(await ic.delegatorNotPaid()).to.be.equal(delegator2);
    })

    it("delegatorNotPaid is unset when the delegator gets paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.setDelegatorNotPaid_mock(delegator1);

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1]);
        return expect(await ic.delegatorNotPaid()).to.be.equal(ZERO_ADDR);
    })

    it("oracle reports 0 points for a collator without enough deposits to cover claims; member defaults", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit
        expect(await getDeposit(member1)).to.be.bignumber.equal(zero);

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        expect(await ic.delegatorNotPaid()).to.be.equal(ZERO_ADDR); // delegatorNotPaid is not affected by collator default
        return expect(await getMaxDefault(member1)).to.be.bignumber.gt(zero);
    })

    it("oracle reports 0 points for a collator; 2 delegators execute payout and get paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));
        const delegator2BalanceExpected = delegator2BalanceStart.add(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero);
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceExpected);
    })

    it("oracle reports 0 points for a collator; one delegator (of 2 owed cover) executes payout and gets paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("oracle reports 0 points for a collator twice; a delegator can execute a payout and get paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))))
            .mul(new BN("2")); // twice
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))))
            .mul(new BN("2")); // twice

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await om.reportPara(member1, newEra2, 1, oracleData, { from: member1 }); // second
        await ic.payOutCover([delegator1]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("oracle reports 0 points and then X>0 points for a collator; a delegator executes a payout and gets paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        const collatorsOK = [{
            collatorAccount: member1,
            points: "140",
            active: true,
            bond: web3.utils.toWei("500", "ether"),
            delegationsTotal: web3.utils.toWei("25000", "ether"),
            topActiveDelegations: topActiveDelegations1
        }];
        const oracleDataSecond = {
            ...oracleData,
            collators: collatorsOK
        }

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await om.reportPara(member1, newEra2, 1, oracleDataSecond, { from: member1 }); // second
        await ic.payOutCover([delegator1]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("a delegator cannot execute a payout twice", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1]);
        await ic.payOutCover([delegator1]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("a delegator cannot execute a payout that is less than the min payout", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        const newMinPayout = payoutsOwedTotal.add(new BN(web3.utils.toWei("0.1", "ether"))); // an amount bigger than both covers owed
        await ic.setMinPayout(newMinPayout, { from: manager });
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1); // not paid out
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2); // not paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceStart); // not changed
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("a delegator cannot execute a payout when the reducible balance is not enough; delegator not paid is set", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await ic.transfer_mock(dev, deposit); // move funds away
        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1); // not paid out
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2); // not paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceStart); // not changed
        expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceStart); // not changed
        return expect(await ic.delegatorNotPaid()).to.be.equal(payoutReversed ? delegator2 : delegator1);
    })

    /*it("member (with cover owed) is removed from the whitelist; delegators can continue with payouts", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await ic.whitelist(member1, false, { from: manager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2]);

        await expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        await expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero);
        await expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        await expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero);
        await expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })*/

    it("member deposits, 0 points are recorded, delegator gets payout; member cannot decrease by the original balance", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2]);
        await expect(ic.scheduleDecreaseCover(member1, deposit, { from: member1 })).to.be.rejectedWith('EXC_DEP');
    })

    it("member deposits, 0 points are recorded, delegator gets payout; member can decrease by original balance minus cover claimed, and execute decrease", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const possibleDecreaseExpected = new BN(deposit).sub(payoutsOwedTotal)

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2]);
        await ic.scheduleDecreaseCover(member1, possibleDecreaseExpected, { from: member1 }); // should not throw
        const executeDelay = await ic.getErasCovered(member1, { from: dev });
        await ic.timetravel(1 + executeDelay);
        await ic.executeScheduled(member1, { from: member1 }); // should not throw
    })

    it("erasCovered (same as member decrease execution delay) is calculated correctly based on a member's deposit (1)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const refundPerEra = new BN(collators[0].delegationsTotal).mul(new BN(_stake_unit_cover)).div(new BN(web3.utils.toWei("1", "ether")))
        const erasCoveredExpected = BN.min(new BN("1080"), new BN(deposit).div(refundPerEra));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        return expect(await ic.getErasCovered(member1, { from: dev })).to.be.bignumber.equal(erasCoveredExpected);
    })

    it("erasCovered (same as member decrease execution delay) is calculated correctly based on a member's deposit (2)", async () => {
        const deposit = web3.utils.toWei("1000", "ether");
        const newEra = new BN("222");
        const refundPerEra = new BN(collators[0].delegationsTotal).mul(new BN(_stake_unit_cover)).div(new BN(web3.utils.toWei("1", "ether")))
        const erasCoveredExpected = BN.min(new BN("1080"), new BN(deposit).div(refundPerEra));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        return expect(await ic.getErasCovered(member1, { from: dev })).to.be.bignumber.equal(erasCoveredExpected);
    })

    it("defaulted member makes a deposit; delegators can resume payouts", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit
        expect(await getDeposit(member1)).to.be.bignumber.equal(zero);
        const membersDepositTotalStart = deposit;
        const membersDepositTotalexpected = new BN(deposit).add(new BN(deposit)).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });

        expect(await getMaxDefault(member1)).to.be.bignumber.equal(payoutsOwedTotal1.gtn(payoutsOwedTotal2) ? payoutsOwedTotal1 : payoutsOwedTotal2);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero); // cover for delegator #1 was paid; only #2 remaining
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceStart); // not changed

        await ic.payOutCover([delegator1]); // nothing should change

        expect(await getMaxDefault(member1)).to.be.bignumber.equal(payoutsOwedTotal1.gtn(payoutsOwedTotal2) ? payoutsOwedTotal1 : payoutsOwedTotal2);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero); // cover for delegator #1 was paid; only #2 remaining
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceStart); // not changed

        // defaulted member makes a deposit
        await ic.depositCover(member1, { from: member1, value: deposit });
        await om.reportPara(member1, newEra2, 1, oracleData, { from: member1 });
        expect(await getMaxDefault(member1)).to.be.bignumber.equal(zero);

        // delegators will get paid only for the newly reported round (rounds while the collator had defaulted are foregone / don't accumulate)
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal); // cover for delegator #1 was paid; only #2 remaining
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceStart);

        await ic.payOutCover([delegator1]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        return expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
    })

    it("memberNotPaid cannot be set to another member until the first one is paid", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("9", "ether");
        const transfer = web3.utils.toWei("17", "ether");
        const expected = web3.utils.toWei("1", "ether");
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.whitelist(member2, member2, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.setErasCovered("33", member2, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.depositCover(member2, { from: member2, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1 });
        await ic.scheduleDecreaseCover(member2, decrease, { from: member2 });
        await ic.timetravel("40");
        await ic.transfer_mock(dev, transfer);

        await ic.executeScheduled(member1, { from: member1 }); // fails silently
        expect(await ic.memberNotPaid()).to.be.equal(member1);
        await ic.executeScheduled(member2, { from: member2 }); // fails silently
        expect(await ic.memberNotPaid()).to.be.equal(member1);

        // send back half the funds (enough to pay member1 decrease but not member2)
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: deposit });
        await ic.executeScheduled(member1, { from: member1 });
        // make sure it was actually executed
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
        expect(await ic.memberNotPaid()).to.be.equal(ZERO_ADDR);
        await ic.executeScheduled(member2, { from: member2 }); // fails silently (not enough funds)
        return expect(await ic.memberNotPaid()).to.be.equal(member2);
    })

    /*it("manager can force the decrease of a de-whitelisted member's deposits", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("8", "ether");
        const expected = web3.utils.toWei("2", "ether");
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCoverManager(decrease, member1, { from: manager });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: dev });
        await expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        await expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
    })*/

    /*it("a decrease that equals the entire deposit sets the member's active status to false", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = deposit;
        const expected = zero;
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(await getIsActive(member1)).to.be.true;
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCoverManager(decrease, member1, { from: manager });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: dev });
        await expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        await expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
        await expect(await getIsActive(member1)).to.be.equal(false);
    })*/

    it("a member that sets maxCoveredDelegation > 0, pays cover only for up to that amount", async () => {
        const maxCoveredDelegation = web3.utils.toWei("500", "ether"); // vs delegation of 1000 for delegator1
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const payoutsOwedTotal1 = new BN(_stake_unit_cover).mul(
            BN.min(new BN(maxCoveredDelegation), new BN(topActiveDelegations1[0].amount))
                .div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover).mul(
            BN.min(new BN(maxCoveredDelegation), new BN(topActiveDelegations1[1].amount))
                .div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.memberSetMaxCoveredDelegation(member1, maxCoveredDelegation, { from: member1 });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));
        const delegator2BalanceExpected = delegator2BalanceStart.add(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, member1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2]);
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero);
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceExpected);
    })
})
