// Example test script - Uses Mocha and Ganache
const AuthManager = artifacts.require("AuthManager");
const InactivityCover = artifacts.require("InactivityCover_mock");
const Oracle = artifacts.require("Oracle");
const OracleMaster = artifacts.require("OracleMaster");
const DepositStaking = artifacts.require("DepositStaking");

const chai = require("chai");
const BN = require('bn.js');
const chaiBN = require("chai-bn")(BN);
chai.use(chaiBN);

const chaiAsPromised = require("chai-as-promised");
const { assert } = require("chai");
chai.use(chaiAsPromised);

const chaiAlmost = require('chai-almost');
chai.use(chaiAlmost(0.1));

const expect = chai.expect;

contract('InactivityCover', accounts => {

    // test ging under MIN_DEPOSIT and going inactive
    // check getErasCovered returns the right number
    
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

    require('dotenv').config()
    const _min_deposit = web3.utils.toWei(process.env.MIN_DEPOSIT, "ether");
    const _max_deposit_total = web3.utils.toWei(process.env.MAX_DEPOSIT_TOTAL, "ether");
    const _stake_unit_cover = web3.utils.toWei(process.env.STAKE_UNIT_COVER, "wei");
    const _min_payout = web3.utils.toWei(process.env.MIN_PAYOUT, "wei"); // practically no min payment
    const _eras_between_forced_undelegation = process.env.ERAS_BETWEEN_FORCED_UNDELEGATION;
    const _quorum = process.env.QUORUM;
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const zero = new BN("0")
    const payoutReversed = false;

    function bnToEther(bignumber) {
        return new BN(bignumber).div(new BN("1000000000000000000")).toNumber()
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
            _eras_between_forced_undelegation
        );

    });

    it("have all variables initialized", async () => {
        await expect(om.QUORUM()).to.eventually.be.bignumber.equal(_quorum);
        await expect(ic.MIN_DEPOSIT()).to.eventually.be.bignumber.equal(_min_deposit);
        await expect(ic.MAX_DEPOSIT_TOTAL()).to.eventually.be.bignumber.equal(_max_deposit_total);
        await expect(ic.STAKE_UNIT_COVER()).to.eventually.be.bignumber.equal(_stake_unit_cover);
        await expect(ic.MIN_PAYOUT()).to.eventually.be.bignumber.equal(_min_payout);
        await expect(ic.ERAS_BETWEEN_FORCED_UNDELEGATION()).to.eventually.be.bignumber.equal(_eras_between_forced_undelegation);
    });

    it("contracts are connected", async () => {
        await expect(om.INACTIVITY_COVER()).to.eventually.be.equal(ic.address);
        await expect(om.ORACLE()).to.eventually.be.equal(or.address);
        await expect(om.AUTH_MANAGER()).to.eventually.be.equal(am.address);
        await expect(or.ORACLE_MASTER()).to.eventually.be.equal(om.address);
        await expect(or.INACTIVITY_COVER()).to.eventually.be.equal(ic.address);
        await expect(ds.AUTH_MANAGER()).to.eventually.be.equal(am.address);
        await expect(ds.INACTIVITY_COVER()).to.eventually.be.equal(ic.address);
        await expect(ic.AUTH_MANAGER()).to.eventually.be.equal(am.address);
        await expect(ic.ORACLE_MASTER()).to.eventually.be.equal(om.address);
        await expect(ic.DEPOSIT_STAKING()).to.eventually.be.equal(ds.address);
    });

    it("whitelisted member collator makes a deposit which results to a member entry", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(deposit);
        await expect(ic.getIsMember(member1)).to.eventually.be.true;
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(zero);
    })

    it("non-whitelisted collator cannot make a deposit", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await expect(ic.depositCover(member1, { from: member1, value: deposit })).to.be.rejectedWith('NOT_WLISTED');
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal("0");
        await expect(ic.getIsMember(member1)).to.eventually.be.equal(false);
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(zero);
    })

    it("member cannot make a deposit that is under min deposit", async () => {
        await ic.whitelist(member1, true, { from: manager });
        const lessThanMinDeposit = web3.utils.toWei((1000 * process.env.MIN_DEPOSIT - 500).toString(), "milli")
        await expect(ic.depositCover(member1, { from: member1, value: lessThanMinDeposit })).to.be.rejectedWith('BEL_MIN_DEP');
    })

    it("member cannot make a despoit that is above max deposit", async () => {
        await ic.whitelist(member1, true, { from: manager });
        const moreThanMinDeposit = web3.utils.toWei((1000 * process.env.MAX_DEPOSIT_TOTAL + 500).toString(), "milli")
        await expect(ic.depositCover(member1, { from: member1, value: moreThanMinDeposit })).to.be.rejectedWith('EXCEEDS_MAX_DEPOSIT_TOTAL');
    })

    it("member makes 2 deposits", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const deposit2 = web3.utils.toWei("15", "ether");
        const expected = web3.utils.toWei("25", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.depositCover(member1, { from: member1, value: deposit2 });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(ic.getIsMember(member1)).to.eventually.be.true;
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(zero);
    })

    it("member makes a deposit, then they are removed from whitelist; they cannot make another deposit", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await expect(ic.depositCover(member1, { from: member1, value: deposit })).to.be.rejectedWith('NOT_WLISTED');
    })

    it("member schedules a cover decrease; check that deposit is not affected", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(new BN(zero));
        expect(amount).to.be.bignumber.equal(new BN(decrease));
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(deposit);
        await expect(ic.getIsMember(member1)).to.eventually.be.true;
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(zero);
    })

    it("member cannot schedule a decrease if they have never made a deposit", async () => {
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await expect(ic.scheduleDecreaseCover(decrease, { from: member1 })).to.be.rejectedWith('NO_DEP');
    })

    it("member cannot schedule a decrease for more than their deposit amount", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("15", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.scheduleDecreaseCover(decrease, { from: member1 })).to.be.rejectedWith('EXCEED_DEP');
    })

    it("member cannot schedule a 0 decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("0", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.scheduleDecreaseCover(decrease, { from: member1 })).to.be.rejectedWith('ZERO_DECREASE');
    })

    it("non-whitelisted member can still schedule a decrease to protect members from having their deposits locked", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(new BN(zero));
        expect(amount).to.be.bignumber.equal(new BN(decrease));
    })

    it("member cannot schedule a second increase while a decrease is pending", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await expect(ic.scheduleDecreaseCover(decrease, { from: member1 })).to.be.rejectedWith('DECR_EXIST');
    })

    it("member can cancel a scheduled decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.cancelDecreaseCover({ from: member1 });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(new BN(zero));
        expect(amount).to.be.bignumber.equal(new BN(zero));
    })

    it("member can execute a scheduled decrease; deposit is updated and funds are withdrawn", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member1 });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(web3.eth.getBalance(member1)).to.eventually.be.bignumber.equal(balanceEndExpected);
        //expect(bnToEther(await web3.eth.getBalance(member1))).to.almost.equal(bnToEther(balanceEndExpected.toString()));
    })

    it("anyone can execute a member's scheduled decrease", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member2 });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(web3.eth.getBalance(member1)).to.eventually.be.bignumber.equal(balanceEndExpected);
    })

    it("member cannot execute a scheduled decrease early", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('NOT_EXECUTABLE');
    })

    it("member cannot execute a scheduled decrease early (2)", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("20");
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('NOT_EXECUTABLE');
    })

    it("member cannot execute a scheduled decrease when their delay is not set", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("40");
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('DEL_N_SET');
    })

    it("member cannot execute a scheduled decrease if they never scheduled one", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member cannot cancel a scheduled decrease if they never scheduled one", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.cancelDecreaseCover({ from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member can execute a scheduled decrease early, if execute delay is updated to allow it", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("20");
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('NOT_EXECUTABLE');
        await ic.setExecuteDelay("18", member1, { from: manager });
        await ic.executeScheduled(member1, { from: member2 });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(web3.eth.getBalance(member1)).to.eventually.be.bignumber.equal(balanceEndExpected);
    })

    it("member cannot execute a cancelled decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.cancelDecreaseCover({ from: member1 });
        await expect(ic.executeScheduled(member1, { from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member cannot execute a decrease when reducible balance is not enough; memberNotPaid is set", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const transfer = web3.utils.toWei("9", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.transfer_mock(dev, transfer);
        await ic.executeScheduled(member1, { from: member1 }); // fails silently; there is no DecreaseCoverEvent event
        await expect(ic.memberNotPaid()).to.eventually.be.equal(member1);
    })

    it("member cannot cancel a decrease that is already cancelled", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.timetravel("40");
        await ic.cancelDecreaseCover({ from: member1 });
        await expect(ic.cancelDecreaseCover({ from: member1 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("non-whitelisted member can still execute a scheduled decrease", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));
        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.whitelist(member1, false, { from: manager });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member2 });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(web3.eth.getBalance(member1)).to.eventually.be.bignumber.equal(balanceEndExpected);
    })

    it("oracle data can be pushed and era is updated", async () => {
        const newEra = new BN("222");
        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(om.eraId()).to.eventually.be.bignumber.equal(newEra);
    })

    it("oracle data for an old era cannot be pushed", async () => {
        const newEra = new BN("222");
        const oldEra = new BN("221");
        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(om.reportRelay(oldEra, oracleData, { from: member1 })).to.be.rejectedWith('OM: ERA_TOO_OLD');
    })

    it("oracle reports 0 points for collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(coverOwedTotal1);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for a non-member collator; check not affected for payout amounts, deposits, total deposit, and cover owed", async () => {
        const newEra = new BN("222");

        await ic.whitelist(member1, true, { from: manager });
        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(zero);
    })

    it("oracle reports 0 points for a dewhitelisted collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));

        await om.addOracleMember(member1, { from: oracleManager });
        await ic.whitelist(member1, false, { from: manager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(coverOwedTotal1);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for a collator and X>0 points for another member collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member2, true, { from: manager });
        await ic.depositCover(member2, { from: member2, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(coverOwedTotal1);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
    })

    it("oracle reports positive points for 2 collators; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");


        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member2, true, { from: manager });
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

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleDataThis, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
    })

    it("oracle reports not-active for collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));

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

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleDataThis, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(coverOwedTotal1);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for a collator but the reducible balance is not enough; delegatorNotpaid is set", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.transfer_mock(dev, deposit); // send all the funds away 

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.delegatorNotPaid()).to.eventually.be.equal(delegator1);
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(zero); // default is not affected by reducible default
    })

    it("when delegatorNotpaid is set, it does not change when another delegator does not get paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.setDelegatorNotPaid_mock(delegator2);
        await ic.transfer_mock(dev, deposit); // send all the funds away

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.delegatorNotPaid()).to.eventually.be.equal(delegator2);
    })

    it("delegatorNotPaid is unset when the delegator gets paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.setDelegatorNotPaid_mock(delegator1);

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.delegatorNotPaid()).to.eventually.be.equal(ZERO_ADDR);
    })

    it("oracle reports 0 points for a collator without enough deposits to cover claims; member defaults", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(zero);

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.delegatorNotPaid()).to.eventually.be.equal(ZERO_ADDR); // delegatorNotPaid is not affected by collator default
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.gt(zero);
    })

    it("oracle reports 0 points for a defaulted collator; variables are updated except MaxDefault because hardcoded default is larger", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const defaultAmount = web3.utils.toWei("10", "ether");

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit to force default
        await ic.default_mock(member1, defaultAmount); // set max default to a higher mocked value
        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(defaultAmount);
    })

    it("the largest defaulted cover is saved at MaxDefault if two delgators default (1)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit;

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(coverOwedTotal1.gtn(coverOwedTotal2) ? coverOwedTotal1 : coverOwedTotal2);
    })

    it("the largest defaulted cover is saved at MaxDefault if two delgators default (2)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const oracleDataThis = {
            ...oracleData,
            collators: [{
                ...collators[0],
                // reverse delegations order
                topActiveDelegations: [topActiveDelegations1[1], topActiveDelegations1[0]]
            }]
        }
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit;

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleDataThis, { from: member1 });
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(coverOwedTotal1.gtn(coverOwedTotal2) ? coverOwedTotal1 : coverOwedTotal2);
    })

    it("oracle reports 0 points for a collator; 2 delegators execute payout and get paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(coverOwedTotal1));
        const delegator2BalanceExpected = delegator2BalanceStart.add(new BN(coverOwedTotal2));

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2], [member1, member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceExpected);
        await expect(web3.eth.getBalance(delegator2)).to.eventually.be.bignumber.equal(delegator2BalanceExpected);
    })

    it("oracle reports 0 points for a collator; one delegator (of 2 owed cover) executes payout and gets paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(coverOwedTotal1));

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2); // has not been paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceExpected);
        await expect(web3.eth.getBalance(delegator2)).to.eventually.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("oracle reports 0 points for a collator twice; a delegator can execute a payout and get paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))))
            .mul(new BN("2")); // twice
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))))
            .mul(new BN("2")); // twice

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(coverOwedTotal1));

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await om.reportRelay(newEra2, oracleData, { from: member1 }); // second
        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2); // has not been paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceExpected);
        await expect(web3.eth.getBalance(delegator2)).to.eventually.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("oracle reports 0 points and then X>0 points for a collator; a delegator executes a payout and gets paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(coverOwedTotal1));

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

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await om.reportRelay(newEra2, oracleDataSecond, { from: member1 }); // second
        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2); // has not been paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceExpected);
        await expect(web3.eth.getBalance(delegator2)).to.eventually.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("a delegator cannot execute a payout twice", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(coverOwedTotal1));

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1], [member1]);
        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2); // has not been paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceExpected);
        await expect(web3.eth.getBalance(delegator2)).to.eventually.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("a delegator cannot execute a payout that is less than the min payout", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));

        const newMinPayout = coverOwedTotal.add(new BN(web3.utils.toWei("1", "ether"))); // an amount bigger than both covers owed
        await ic.setMinPayout(newMinPayout, { from: manager });
        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2], [member1, member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(coverOwedTotal1); // not paid out
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2); // not paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceStart); // not changed
        await expect(web3.eth.getBalance(delegator2)).to.eventually.be.bignumber.equal(delegator2BalanceStart); // not changed
    })

    it("a delegator cannot execute a payout when the reducible balance is not enough; delegator not paid is set", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const delegator2BalanceStart = new BN(await web3.eth.getBalance(delegator2));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));

        await ic.transfer_mock(dev, deposit); // move funds away
        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2], [member1, member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(coverOwedTotal1); // not paid out
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2); // not paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceStart); // not changed
        await expect(web3.eth.getBalance(delegator2)).to.eventually.be.bignumber.equal(delegator2BalanceStart); // not changed
        await expect(ic.delegatorNotPaid()).to.eventually.be.equal(payoutReversed ? delegator2 : delegator1);
    })

    it("member (with cover owed) is removed from the whitelist; delegators can continue with payouts", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));

        await om.addOracleMember(member1, { from: oracleManager });
        await ic.whitelist(member1, false, { from: manager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2], [member1, member1]);

        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
    })

    it("member deposits, 0 points are recorded, delegator gets payout; member cannot decrease by the original balance", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2], [member1, member1]);
        await expect(ic.scheduleDecreaseCover(deposit, { from: member1 })).to.be.rejectedWith('EXCEED_DEP');
    })

    it("member deposits, 0 points are recorded, delegator gets payout; member can decrease by original balance minus cover claimed, and execute decrease", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));
        const possibleDecreaseExpected = new BN(deposit).sub(coverOwedTotal)

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await ic.payOutCover([delegator1, delegator2], [member1, member1]);
        await ic.scheduleDecreaseCover(possibleDecreaseExpected, { from: member1 }); // should not throw
        const executeDelay = await ic.getErasCovered(member1, { from: dev });
        await ic.timetravel(1 + executeDelay);
        await ic.executeScheduled(member1, { from: member1 }); // should not throw
    })

    it("erasCovered (same as member decrease execution delay) is calculated correctly base don a member's deposit (1)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const refundPerEra = new BN(collators[0].delegationsTotal).mul(new BN(_stake_unit_cover)).div(new BN(web3.utils.toWei("1", "ether")))
        const erasCoveredExpected = BN.min(new BN("1080"), new BN(deposit).div(refundPerEra));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getErasCovered(member1, { from: dev })).to.eventually.be.bignumber.equal(erasCoveredExpected);
    })

    it("erasCovered (same as member decrease execution delay) is calculated correctly base don a member's deposit (2)", async () => {
        const deposit = web3.utils.toWei("1000", "ether");
        const newEra = new BN("222");
        const refundPerEra = new BN(collators[0].delegationsTotal).mul(new BN(_stake_unit_cover)).div(new BN(web3.utils.toWei("1", "ether")))
        const erasCoveredExpected = BN.min(new BN("1080"), new BN(deposit).div(refundPerEra));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });
        await expect(ic.getErasCovered(member1, { from: dev })).to.eventually.be.bignumber.equal(erasCoveredExpected);
    })
    
    it("defaulted member makes a deposit; delegators can resume payouts", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const delegator1BalanceStart = new BN(await web3.eth.getBalance(delegator1));
        const coverOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const coverOwedTotal = new BN(coverOwedTotal1).add(new BN(coverOwedTotal2));

        await ic.whitelist(member1, true, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(zero);
        const membersDepositTotalStart = deposit;
        const membersDepositTotalexpected = new BN(deposit).add(new BN(deposit)).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(coverOwedTotal1)).sub(new BN(coverOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(coverOwedTotal1));

        await om.addOracleMember(member1, { from: oracleManager });
        await om.reportRelay(newEra, oracleData, { from: member1 });

        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(coverOwedTotal1.gtn(coverOwedTotal2) ? coverOwedTotal1 : coverOwedTotal2);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero); // has not been paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalStart);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero); // cover for delegator #1 was paid; only #2 remaining
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceStart); // not changed

        await ic.payOutCover([delegator1], [member1]); // nothing should change

        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(coverOwedTotal1.gtn(coverOwedTotal2) ? coverOwedTotal1 : coverOwedTotal2);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(zero); // has not been paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalStart);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(zero); // cover for delegator #1 was paid; only #2 remaining
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceStart); // not changed

        // defaulted member makes a deposit
        await ic.depositCover(member1, { from: member1, value: deposit });
        await om.reportRelay(newEra2, oracleData, { from: member1 });
        await expect(ic.getMaxDefault(member1)).to.eventually.be.bignumber.equal(zero);

        // delegators will get paid only for the newly reported round (rounds while the collator had defaulted are foregone / don't accumulate)
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(coverOwedTotal1);
        await expect(ic.getPayoutAmount(delegator2, member1)).to.eventually.be.bignumber.equal(coverOwedTotal2); // has not been paid out
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal); // cover for delegator #1 was paid; only #2 remaining
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceStart);

        await ic.payOutCover([delegator1], [member1]);
        await expect(ic.getPayoutAmount(delegator1, member1)).to.eventually.be.bignumber.equal(zero);
        await expect(ic.membersDepositTotal()).to.eventually.be.bignumber.equal(membersDepositTotalexpected);
        await expect(ic.coverOwedTotal()).to.eventually.be.bignumber.equal(coverOwedTotal2); // cover for delegator #1 was paid; only #2 remaining
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(depositExpected);
        await expect(web3.eth.getBalance(delegator1)).to.eventually.be.bignumber.equal(delegator1BalanceExpected);
    })

    it("memberNotPaid cannot be set to another member until the first one is paid", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("9", "ether");
        const transfer = web3.utils.toWei("17", "ether");
        const expected = web3.utils.toWei("1", "ether");
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));

        await ic.whitelist(member1, true, { from: manager });
        await ic.whitelist(member2, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.setExecuteDelay("33", member2, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.depositCover(member2, { from: member2, value: deposit });
        await ic.scheduleDecreaseCover(decrease, { from: member1 });
        await ic.scheduleDecreaseCover(decrease, { from: member2 });
        await ic.timetravel("40");
        await ic.transfer_mock(dev, transfer);

        await ic.executeScheduled(member1, { from: member1 }); // fails silently
        await expect(ic.memberNotPaid()).to.eventually.be.equal(member1);
        await ic.executeScheduled(member2, { from: member2 }); // fails silently
        await expect(ic.memberNotPaid()).to.eventually.be.equal(member1);

        // send back half the funds (enough to pay member1 decrease but not member2)
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: deposit });
        await ic.executeScheduled(member1, { from: member1 });
        // make sure it was actually executed
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(web3.eth.getBalance(member1)).to.eventually.be.bignumber.equal(balanceEndExpected);
        await expect(ic.memberNotPaid()).to.eventually.be.equal(ZERO_ADDR);
        await ic.executeScheduled(member2, { from: member2 }); // fails silently (not enough funds)
        await expect(ic.memberNotPaid()).to.eventually.be.equal(member2);
    })

    it("manager can force the decrease of a de-whitelisted member's deposits", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("8", "ether");
        const expected = web3.utils.toWei("2", "ether");
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));

        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCoverManager(decrease, member1, { from: manager });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: dev });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(web3.eth.getBalance(member1)).to.eventually.be.bignumber.equal(balanceEndExpected);
    })

    it("a decrease that equals the entire deposit sets the member's active status to false", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = deposit;
        const expected = zero;
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const balanceEndExpected = balanceStart.sub(new BN(deposit)).add(new BN(decrease));

        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.getIsActive(member1)).to.eventually.be.true;
        await ic.whitelist(member1, false, { from: manager });
        await ic.scheduleDecreaseCoverManager(decrease, member1, { from: manager });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: dev });
        await expect(ic.getDeposit(member1)).to.eventually.be.bignumber.equal(expected);
        await expect(web3.eth.getBalance(member1)).to.eventually.be.bignumber.equal(balanceEndExpected);
        await expect(ic.getIsActive(member1)).to.eventually.be.equal(false);
    })

    it("manager cannot force the decrease of a whitelisted member", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = deposit;

        await ic.whitelist(member1, true, { from: manager });
        await ic.setExecuteDelay("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1, value: deposit });
        await expect(ic.getIsActive(member1)).to.eventually.be.true;
        await expect(ic.scheduleDecreaseCoverManager(decrease, member1, { from: manager })).to.be.rejectedWith('IS_WLISTED');
    })

})
