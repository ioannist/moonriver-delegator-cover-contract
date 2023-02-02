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
    const manager = accounts[2]; // a collator member
    const member1 = accounts[3]
    const member2 = accounts[4]
    const member3 = accounts[5]
    const delegator1 = accounts[6]
    const delegator2 = accounts[7]
    const delegator3 = accounts[8]
    const oracleManager = accounts[9] // the oracle manager
    const stakingManager = accounts[9] // the manager responsible for staking contract funds
    const agent007 = accounts[10] // this is an unknown user with no privileges; used to test functions callable by anyone
    const member1Proxy = accounts[11] // the representative (proxy) account that members use to manage their accounts
    const member2Proxy = accounts[12]
    const member3Proxy = accounts[13]
    const oracle1 = accounts[14] // the representative (proxy) account that oracles use to submit reports
    const oracle2 = accounts[15] 
    const oracle3 = accounts[16] 

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
    const topActiveDelegations300 = [{
        ownerAccount: "0x980A36Ecafdf6fAcba86Bf8f4896cb013Fba3F06",
        amount: "20000000000000000000000"
    }, {
        ownerAccount: "0x61d690f86f229B6967CCCdb91Af33743863De536",
        amount: "839000000000000000000"
    }, {
        ownerAccount: "0x0c988DA8a34Feae94BB076bd7B92d378E60130Ab",
        amount: "650000000000000000000"
    }, {
        ownerAccount: "0x90a7fBb9C0f6FD1697038890b4f868884b6EC1ad",
        amount: "605394780656714996274"
    }, {
        ownerAccount: "0x0b9D0bfD36730219D7aDe67897FC63b2535EBF3D",
        amount: "65100000000000000000"
    }, {
        ownerAccount: "0x1e5d13496de4A81225454aFc9d0fa06F6BD97421",
        amount: "50000000000000000000"
    }, {
        ownerAccount: "0xdb6a08918CDEAa93dC7E440E28028c57028CC5F2",
        amount: "39090000000000000000"
    }, {
        ownerAccount: "0xEb10b76FA99Dd071fdba1A097179a8fAa9130209",
        amount: "26534558965528205084"
    }, {
        ownerAccount: "0x91B9C00dF4c1473Ce6c3aaF86a71f76614b45D48",
        amount: "19415367056745570109"
    }, {
        ownerAccount: "0x14F21c120666246e707cA0E6FB544948A2Ea89EC",
        amount: "12908407197858254946"
    }, {
        ownerAccount: "0x2c507D8A3517799061c00cd6e4868C62210b647f",
        amount: "12000000000000000000"
    }, {
        ownerAccount: "0x7994F5f829A9D6Edf535Ca0d101a950fF2511DEE",
        amount: "11238343099653210411"
    }, {
        ownerAccount: "0x136b60EF24298699359a107559Fb9ed457bb6F74",
        amount: "10000000000000000000"
    }, {
        ownerAccount: "0x717022f177547794daaC98eB16610745E1fa0702",
        amount: "6780690728832393768"
    }, {
        ownerAccount: "0x720FeDf6Bbe72343438e333Ddd5475301D301A68",
        amount: "6484178946656543971"
    }, {
        ownerAccount: "0xD62279ed9f2C59Fb096EF26801857D4316502266",
        amount: "6000000000000000000"
    }, {
        ownerAccount: "0x0670B1D9120C53407Dd82a3257413b84a2D111D6",
        amount: "5888305376536004818"
    }, {
        ownerAccount: "0x9F82B95B06aA89184Cc4D3344f91F6F8ffE292f9",
        amount: "5885531013307856654"
    }, {
        ownerAccount: "0x529d4De47F6F04F73dF413e82C229D15BEFc6988",
        amount: "5800000000000000000"
    }, {
        ownerAccount: "0x38816325a61438dB0e6Fa3F0DD17b5c9ea0a38f9",
        amount: "5500000000000000000"
    }, {
        ownerAccount: "0xb926E36D439106090Be1151347CFB916E44AFE00",
        amount: "5241311804857228573"
    }, {
        ownerAccount: "0xe1aA15E6a070a396De4E76DE4067bb759DC57889",
        amount: "5100000000000000000"
    }, {
        ownerAccount: "0x3F2d4De8F404fCD17370E6514899705f619e1646",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8a6218f6aB4a63C94C25979548783439afe5dE97",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7D1C74950D8E2A83Df0C29145249EB081AAb7244",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x88300ba09Af34b061feC5043c91edCA78DC53F4C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x397d5AfC74531deFF4aA8de64800E552CD0e65e9",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6840CD1058a2aEB938c654d94f6e5437FFF15716",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xf11B56e82037a87FA35a6817dA01F64b68aE6E6F",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x26Ecf6c60564Dcb6fC8da73Fbde6bf1bF91d588a",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xDa7eeA5F7d86Ea56fd246fF65AfF7614364b8DB4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x32d3b2a18B4933156031A8D3d74A7dEFa8aC55Ea",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xE8b70fD46ac321E7deac510f2cabF78769484fcb",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xD678C9dDdF9f75a4dB25629AEE17b8B0548cc004",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2cA97ebe5DbE879c9DBC29374DCd6dB3B732fF31",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xbf126efcE1Deff3D01259E2510B8B9f0A53d4566",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7AF18D5e1789bA0dAe4Fc928cd4ea427289f7F0F",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x5F9F115E142DcBc84397f002b0449e652575d0DC",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xE27a5477FA53E7Ed873d04dEa8494B31C9146Fb4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x27632f654C48AcA337a0c403ABc69828659bAF72",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x126fc373c2E2F97DC93DD13D6344a71D8D07822E",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x43503bA922C9218fBc27bA8f4ac1c5ED0476Bb58",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xEd6e50066aFa3eBE86EaeCe1D156B2407F6F1223",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xE46Ab7D6eBa043C35b1C85DEd960AA31dfA2ac94",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa78A14baDAbedb2E5A87FA40d407134127d5198F",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xf99968F8E551f818c2125d944bC3B648a8863875",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xae6C62005174A7ac49356718825d76d8942b4003",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xEB1EFCC854eAFDAf718c5ED38DE5e673a96E64e8",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC9e702C0510a3E41656069EeDeDdE9372eE9897D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xBdE6BE610b6a6710943d1521E295472C2c42Afc6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xf96af76D48352d3906AFaAFA08ae1BB8770539F7",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xBd682dDA496D731C1829a73b9a89FfB895623000",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3B8C665eeb2d1FfdA005616a20492E41CA3f76ba",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xFB5A33fe3C50ddE2b5Ff7c1966048c0b5B8902bA",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xB98D2b05f3Dd32E7aaCD1C316D8Be5FCb32D9981",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xAbB497E9012B7a65390c0633c25E8b5733441A2A",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3C681859fE03a03Fb4E2E788E92341428813E4A6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa5259DE932465dcd9dEfd6be766C6fcd7D704417",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x40f4BC505e0b1e63BD63E620419fCAf4062F675e",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xbACB2b2ba2f6e5ec5dDdfBda0A7B8863a0288246",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xF971482E37A262b835CAb104D57E189Fd1Fb7E4A",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9fE5Bdad20BFd3085687d1CbdFA702B925662e8E",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7c8FeB82D7caD73F32682A6B910B9B8601af4Ef8",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xBA927975f9409b91c5378aC96f9C0D4D19f12c5e",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa7Aa7308D653BbDCFddc99AEF44e0107F656eE22",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa3da544f4e938A9c5B11cD7E62B359E2f8a7748B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4155F2cA0C9A59Da72c7e6dBD72b9791681b684f",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2337764D2EeA205f5896e22289d90e01fb7e07B5",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8F8040c5206D810D8b3405eaA25EB7f249Ad3d5f",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x850B0F8021F612d5043111BC06F6Fd4Ed6C86fCf",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x228aa56D79c89a531c162Ce7B1ace735dCdAD13D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x641d957936EbD8c298Cd59a263457D092d8c0370",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4fe9F512c6E21C666A711E4E32bEF63A555544Dc",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3AcCa8FC6716795CcaC161bd19512f72C8056223",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xA4d9a8Ef345f083C9dB05F5C4cDd9eDa27Af6776",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC0F057202FEE7F97C14D17409a594D2103ecAd81",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC4dB0a595cE9675c8ae1353C375814AeAf9c0cBF",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x32FF0dBF58c08f7BbbB6E1d74fC97F264814584C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xA0afD2db06e6b2465BbB56b2A921C8C3A482669d",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9cc9CB0af3bF3Da6459cd274885af79c6a3b4a7C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x289e653aBD81fD407E7B6D876934D899a553BFBc",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4a7BC8D6899EB68F7D2AF3782c4c79a9A8C00ac8",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC00bAd8AA95e99F3d1d1ABF9767cA34092046d3f",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x86D2FCadb2944BD688f4e7693FB9b19923fcA3fa",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x034f2c850067F70E574fedeF539735655dDB05EA",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xCD56621d5DCae8daA5164843f1e4AAaA5C365043",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xEb5aA8cc52D1eBb4E98Acd03826eC05F8F272066",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xA557A222e0Af70Ba38B036C2f92A6289F0d842F1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3124BCdD48D351Eea123fc0736F387b92351870A",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xDeB59fE021a6d4498b7C14638FB629027d95F99a",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6f8a49237D67718FdC018a66185D9971667442ce",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x91C6649e380432BAc114c0D788b76D1d3F87D943",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xA3d3768E5cF958c68fcf0A2694013866bAa78795",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xD19cf965Ad7D5328cE63b712d7F6a6f856555c49",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xFaA7ACF83fFA7979677d63f4F904deE29fC50522",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC66A3721268f1680e4c30C1dF19065d441261C3C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x13B29436F24ad484256a5f654DA42C879D0ae2b6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x894b6f4F4fcCc0C527c15Dde00EaB1EB8e3DF860",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xBdfd8c5a93F000bF5df0910B22248D622733fE14",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x0021008ce3399A9C6f0Ec9D600cE0aC3E8F946cc",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2D9148Cc949fAB12Afc71fCa749858C15A2061Fd",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xCb0adEDA76B8A4EC15809584121F4897F1Cb6df1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x991Fb61106F0C0E8FbE217C9B204b3bABCc7Ec72",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x08A52fCEe9C8a8537033f1C6415b43977401BEFd",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x06FA477946dB086D034A300B81715Bd0F356bF1F",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xDffd7942d58D6613AF520DBd226461AD81E270f4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7c16D704DcD0aD5B6F0e23dfE57d8a56EF541E1b",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6C36477c8CD9A34f0e62f3c7810240a394C6c9c6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xBAd3CA59C8C7c4CbF1CE05dD66E1F86626242F18",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x126D663362b1C44cD574276AB2acE33761dC12ff",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xB3649cf7bBF415E66ebB069a536D224E66678aBe",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x5e175b03663B03d6b54B4161e15F86Ce39Bb6742",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xc675b629a0B3acEf43D0361213cCa2EeE87a41c3",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xd5fcf031408be231Fc73852A1DBE1B9066de7993",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x56f55748270C67c907208d623064BA7028016dEd",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x585be80d7386aD8c237a59BAa2B704b570368523",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7f993397aec5BB21837c7345315d0949BFAf51eC",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x362504edA33B53d393cA7531C8110f526fe15392",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8492b33dfe18C75C99b28A9A1bb8cD31c969b038",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x204078AF09a526167E092A62e87C66504dc611c2",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa144534aE32D2F8fd0F3075B7541Fc0Cd3Ad630b",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x356953f3062FADA04e03DfdCe8D8120478589CDc",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xdF4E73e5eEacD50B836Bac39AD9BC1E48a605fB1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6720e232ff24d318792500009c1d66f4086F64cd",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa6d41b964BAE5EE15B946018f740B0f7cda0BeBA",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9c39FcaC55cF965b98Da44FC5E70536b01634073",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x13fC51412115954d0c66F5E28DEcc1Eb6F53dF6D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xAf57b3A9Ae8d33e3CC162bd856671369b06b3bEc",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9325baC9a85411A1b462054D648B6b834d367d4E",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4aD8Cb7fa9834B3248F122AbE660Df9A20C6b063",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xEEC84b0672FfFB04B3d8642Bfa20cf3D72bE0D9b",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xf756db6c39233357D6b4AA1dA366877Fe3D0fdDd",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x45b5157211774Caf5f7b1405938203db77144304",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9A9AFeEDf307965b60fE02eb6314412F1E59bF5b",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x74905fAB1fA4Ea0F79Fbf818766648Fd6B6fbbb0",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9f86854B15197057542899CA8E1e0EA7C7fb816B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x5dd097661Dbe6C17BB5f18185784AfcE923b68f3",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x853BdB05AeBfc3667E19dA7001E17d7D117c3227",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x171E6ec9009E9a395fAbEB101f7CF8440d38550e",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x667F558aC854aF4f79511850bdC8ACF1D2be803F",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6F91d1F2edF49b9bC38600E0DfC3d30b3d1285f8",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x55fF4C385B5968080619394fDB37258CB52EDf07",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x618C5429135c4264c8EC3B6085b02cBb1BD73656",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x354F0921eda7317b23518a2c9Cc01B6671aF8eC1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x690243Cb89b7E59F46bf9a3c4C1FA673497D0462",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x48a70aB131ebB706C49ACAf7e7666805515fb16b",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x0Ff2b312a42B055e8955E1D05d87CE1959300538",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xFA93bBe129B52B793bc83D27318dD57DaD5414ba",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x99E68DCAE803E499D114838047641E2ec9D14ABB",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9Ae4b971617c1fB4bcCAA18199450f4cd5A12108",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2f360d3dD786A707edeAe1E40c2Cb820dd5546c1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x091e7D08eCa035af5e235f93e9410ac276833A18",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x1Aa7Ed10a43Bf691ea6D44B8BAAf5Fb19A536ab7",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x52dE7B551F70cce9b679cdC40a005702441F1F7C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7499d32BC976e406BD6C22cdfEeeb67550D4895D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xd3Fd3fad86B1d442DE7c7e72aC797a4A7711d0eB",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3d3618e850D52f054F0c1743b39ef980f1c12A8C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x89eC35293DCa724dcf13ce7618fD2da07a55E620",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x0fFCcAcE5E6F9C75a59862E78b957a4BcE77a014",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x52D1711432Eb2c2244E21Fa34eD87DFC91d376c2",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2CC4015AB1A84B5f29d701A89aa18563f39806E4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xaC75dF890424b93Df233Bef8875a86160198FBFE",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xe36a408dc0E54063171B3A102D7de98eC509fBb3",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x149573B07f73B4eFf217FcE25cCCD5dD542e3B7F",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x03c28892f03d0AE1c9c71496707697D97575a337",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3d86Fc34603371ea3FCcb2550242fDb1fffa98Ef",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xd467999C595f3114ccf4C5521Eb5d89E3C751a09",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8CaA556C67C687971cAcF976D839a2Bd8FE33BAd",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x800e33534dBb75BeB9d311D671D7E59511FBc7c6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xF0D39D36B40E2cAE3A715422aF5715556d10d696",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4A852fBCC38F66317270255Df64982B626fe5B75",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x64856D477Ee01595286880471d1e4c40A5a0Ccd5",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xCeBd691D914883f10F91b22356e09DAaC7aEA4ed",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xf170A2641e10fD37620a44c25C675369E69fc635",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xBB92D403b8474f145Be02a6883599C3674586345",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x08a289e16285e955f699684A8472fD946bf8b5bd",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa56Ce5ed6c5C76471e139C1529452D5B311a57dD",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC66218C2C71aA44Cc18DB0e4BA95d43c9783c08A",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xc2D8eBE1629E5c4182BcA250A456870A3BBc2e2f",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8Ccc61de0BA3D3bE673d4Aa4B02b851C1822E9a7",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xeea0b3074a6c1136895A97640859EA26Eb8ddC34",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa3fd73F84A9B7df4743F7E460821406A2aF00310",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7AD78Ef409Ef84BAA4f9413Bd17ae6A9702A13B5",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x49c2CbBF0718527F79C731A49169Eb2B76BD8201",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x83473afC0F3d947C3608cf0d79FB3043e3B46260",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xF32cb40eD3aB9c4690dE44c7FfEd0040D4f41a1C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x91FC2FfB12FB0a511fa5554763Bcea9eaC31de95",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa393603e4329650180535462E551dcfA1435A1D5",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x58853B2c4c7FECB838B3034Beba96363487ec39a",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4EcA5Ea3311C04F17eD67bF8b8919AfDc4b2236D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x80bbc5547bDEC838894Aa3525A91aEbfd8A4028e",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7543be99B84c72d28A5C3D93A3d408855B51b96f",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8C6b11C081C46d3d2B845e851bBB075fFd1c140B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x00A738DE2C4Fecdcc3E435d39aD9Fe57B5a8d2C0",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x795eab5cD3e4E2B631bf948DfDD9bd3eEe41271E",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x86dAE7500d8C35733025200616d83Ee1749aDDF3",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xf06ae3A96f5ED1eC4Ef59A142F6C57AfC29C93aa",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9842d16e02D4EE37377A982f829F19D241418C14",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x91519655E22E63b009419CE28F9f45Bc2643de61",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xedB1958e1B977ED21884beE8a127CBE44FeCc396",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x76642Bd722A805CB356743643715C29B227c9726",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2E424c5B2E3C48F53C3210421d3E05a9D8437800",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x65988664F47b4b8AA36326127218E5E606D4FA69",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x71752489DEbB598E42789A61fF0E8A52D3D448aE",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7C21c6D788E9d37e4cEfccCd3e3Ebb89e8c0b41C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xaeab1065F728e7b304665aFb2312720Ae523085A",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa6ea403C0F8a5d5be496341f0d24B64d89B6F095",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xFB5D2013348C469621f39E2B87129B6E57ae18ac",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8e0b726080e9F0ce026c71755cbB05b1BA001c4E",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7925C09f7BE545b08BE542A0158743586755bb58",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xd8F14edA0D5e3F727b3688054B51bf9f100CD278",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8FD078e5d621dD35a8d283C02Ab953b7f54df423",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x0D3af0aaE7F7a7396002266c03b925D8fb22288D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x15fD20BDeFEbB83e203f00628fFED02D67517675",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6805B0dBABD58E5Bb1dD879f660d35654c34305B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3F72D7cBd3E58f0356e2E291ABbE01EE1FE4060B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x50746d597D8c0EeE1C03f3cc17860c7b98eA30AD",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xAB14E4539B0B58B2660c95e5F8c2eA8e93731728",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xdED2E2ac35db458A7f7006D6Ef92996F18a2E840",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x35B33d910bAC7C91687bCA6230147186a681F11d",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6aE4E673E099B67a365B66e2B4080561F85Ad4b7",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x76B165E63DF2CC867751029B7367D5ea66Af903e",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7954C6ee18Ff1794744dC1c466dA030a5E4E9E0B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa4Dc75685628260672fEb799aFf9173E070bc1CD",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x44D9415Cde36b826a3fb2C818f27A6aC703F0edB",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xcC096D2c0AAeC10F3d22D499b61E337C606d63fe",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa2DbFF1933F368F6744e42B40A038Ce95Befb397",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7E7E5A36cF18d61AceDa72e4a268B7B6fEDD77E4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9951B8EbF8F81EEB3AB0E76708fe9fd3EA9DBaE1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6a204476537F89Dc74CC929CfE640F280ecCC559",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xaa16751A8222801EA7a1eEdDCb29e0e1D18fC456",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xB4972a96a0F90155c09EFc8fE802fF9567DC0F51",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xe961a827BcD673d40406C4f416aDb90FE61fAB2D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x65788D00951993fa586953e8634E48c5648A1B2B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x97165ECaf048724735B522277C5DF6Ad96089FBa",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x800074e0488f991c04935bd4c88FDEB0dd1A8ed4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2BaD25ee0296F02F8E2E4F68C570389CCE5D252C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x579fA2F97B9BA96af62a6d73947c1851FC67683d",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3357114643a17F84340d3647b6C1F0D959BBDd16",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x237CA1c0340ebE586728E61105499aC8696Cd0d6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x942cA680C32e489B333E0bC4136788f87F832BdD",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6F3151f524AD73663adC7b7D84D4d969fc4770Ab",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x512E169002d4bb928bc241cF42ea88D5941b5CA7",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x50fc2dcE230abeA33942Cb4D985fC427DE38CE3D",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xc0E7B010A2ea298ead1c19e6bA99503824c82a31",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x2e25f92c6DC7994b1f92CE38B8Ff35f5C65E77f8",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4fc7b1feA6c20bd920A426E690E495D2f4F3C16A",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xEDcDEbE48969A70691642C6b99292F652b66d62b",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x0F7F2E52dB62F50ed80924f28e512F33F041BCb6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC4673802480a1feE3fa6A532E2c0a20FD1E925c2",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x51fE8add7991230e4d1B762Df38a9D1900298dE1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xA9DfFbf20Bd4c4F1eB36739b44299De13b6CEDbB",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8977b72a8FDb2b78235B93a16850819524DC4638",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9c542c3796289Caa0AE538699ac59d97b34f6535",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7a4D53eb95C220D6faf9009373C1C8eF5C6Ba0C0",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9Fab833b2e117F52b7D8DcEf63543C0709a9e7Bc",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC2b843f2ED2cc8e92bd4F7100CF6a166519F14ca",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC0212eB66cAc6023A607406f2969da04f8aA4242",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6620b0448d9B16Ce5fac48dfA7AEdaE59A6E4c82",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x859C80749E57aA3656c4e07810C0C83C1E57059f",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xe8aa22f467D6b1702dF6bFFa75aAA1027643131C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9403eF797941c4B87578eD4984A2908F1afBF30a",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa85fdD73d84F5b57fb0b8Ae33028136f01B22Be9",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xF7557abDA4E2Ab7328628843F998329949568483",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x3B66a9F105da03A1BFd301601981C62cfc53890A",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x1361E1f56Fd5C1603D7f99A4297b75c80F38E878",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x5055B871fc2822CC09944d195b1B133b6AD09f24",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x73716DdaC054dA0358E0D272bF52b626aBb0395B",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6bD18C04E5b104E1CEd6975a8FB6e27C785542db",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7f25C67977570371BEfe0a74437c2d2c9207FF41",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x48f1d022fB1540e797Ee7C458563fA142299243C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x28a6F954505B78b9BC14D5bfEa1994f592F87f18",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x585Bf8aba3D9B288b4931920730F33663fEa0670",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x17c1F12b4F12614a60E6A91cF380b82a22ae20b9",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xfaa54Eb59Ff8d01fB4Cd3dB3ceb6C16d15aA91d1",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8e267f05320c088c4de935B856c77E6007F94fC6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xaBEC0f81d32CeaB10B99f3F364E717E875A4f494",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x8c2c52b290B9acE90a74B59f2D42e586A399c672",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xa0033578E83da9608B99C2C35C1F0771168FBD96",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x9705e4c792B8353Fc18Cd03F34C20ce0c076A4F4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x09f5bcb703Cd12f3E736daF6AA51Bca958A6c5A6",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xb4EEb0C8fCDB2C964845311c2292CaDE29A72f86",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x47229e8A056CeBab461b5643cFd165154e37E9Ba",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xee3C14755ab74F93C56A9c35fD0961f8Afe684D5",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x19D4d8C2dDCe44947cd6BCabb0C47F35fFC51423",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x51AB3ab619CEA3B41189fB007718342EaC41B847",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x7afC096Fd3F6b4582BDb8eFa51D38a54eD259415",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x90a80846f94a9b16466c462fA6ADa0374913aaEA",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x09783eB7b5720E6D40E37bB47D47555116Ed37d7",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xc5DC0c6b2C2D7D72712f53595cC82C297A131655",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xe131b07956A1218fe76dBe5E7f7c91dBC02B20B4",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4676493841d68F9462EF6BBD6c0eaD068b0e9040",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x6D8dd4fbF6C6B89de5C7F7a9727e5A06E9f59532",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x4971D3f5483dc8BCEC7c6B0fe94e066726128145",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xCa3F940125F8F00711e680c7Cde1005d0fF7442C",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x32254c9690DFa0a5D534e2BAf33DD0c9B68Ce84E",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xDf786c5c4E49E6CFEc1Be96BCEb7CFcB972d8Fd0",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0x937A20D930721A3Cb9977FBa6c4Ed8bfACf11500",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xAb1b0aD28Ff5f6DFd6eaB1d142583D62df6Af491",
        amount: "5000000000000000000"
    }, {
        ownerAccount: "0xC15828245E0BEAce7a88Fa06EDfa7570bFB27Bb8",
        amount: "5000000000000000000"
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
        finalize: true,
        awarded: "1500",
        collators
    }

    beforeEach(async () => {

        // replenish balancesif low
        await web3.eth.sendTransaction({ to: superior, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: manager, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: member1Proxy, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: member2Proxy, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: member3Proxy, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: oracleManager, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: oracle1, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: oracle2, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: oracle3, from: dev, value: web3.utils.toWei("500", "ether") });
        await web3.eth.sendTransaction({ to: agent007, from: dev, value: web3.utils.toWei("100", "ether") });


        am = await AuthManager.new();
        assert.ok(am);
        await am.initialize({from: superior});
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

    async function getMaxCoveredDelegation(member) {
        const { 3: maxCoveredDelegation } = await ic.getMember(member);
        return maxCoveredDelegation;
    }


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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        expect(await getDeposit(member1)).to.be.bignumber.equal(deposit);
        return expect(await getIsMember(member1)).to.be.true;
    
    })

    it("non-whitelisted collator cannot make a deposit, with proxy precompile accesible", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.setIsProxySelectedCandidate_mock(false);
        await ic.setSimulateNoProxySupport_mock(false);
        await expect(ic.depositCover(member1, { from: member1Proxy, value: deposit })).to.be.rejectedWith('N_COLLATOR_PROXY');
        expect(await getDeposit(member1)).to.be.bignumber.equal("0");
        return expect(await getIsMember(member1)).to.be.equal(false);

    })

    it("non-whitelisted collator cannot make a deposit, with NoManualWhitelistingRequired=true and proxy precompile not accessible", async () => {
        await ic.setSimulateNoProxySupport_mock(true);
        await om.setSimulateNoProxySupport_mock(true);
        const deposit = web3.utils.toWei("10", "ether");
        await ic.setIsProxySelectedCandidate_mock(false);
        await ic.setSimulateNoProxySupport_mock(true);
        await ic.setNoManualWhitelistingRequired(true, { from: manager });
        await expect(ic.depositCover(member1, { from: member1Proxy, value: deposit })).to.be.rejectedWith('CANNOT_CALL_PROXY_PRECOMP_FROM_SC');
        expect(await getDeposit(member1)).to.be.bignumber.equal("0");
        return expect(await getIsMember(member1)).to.be.equal(false);

    })

    it("member cannot make a deposit that is under min deposit", async () => {
        await ic.whitelist(member1, member1Proxy, { from: manager });
        const lessThanMinDeposit = web3.utils.toWei((1000 * process.env.MIN_DEPOSIT - 500).toString(), "milli")
        await expect(ic.depositCover(member1, { from: member1Proxy, value: lessThanMinDeposit })).to.be.rejectedWith('BEL_MIN_DEP');
    })

    it("member cannot make a despoit that is above max deposit", async () => {
        await ic.whitelist(member1, member1Proxy, { from: manager });
        const moreThanMinDeposit = web3.utils.toWei((1000 * process.env.MAX_DEPOSIT_TOTAL + 500).toString(), "milli")
        await expect(ic.depositCover(member1, { from: member1Proxy, value: moreThanMinDeposit })).to.be.rejectedWith('EXC_MAX_DEP');
    })

    it("member makes 2 deposits", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const deposit2 = web3.utils.toWei("15", "ether");
        const expected = web3.utils.toWei("25", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit2 });
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        return expect(await getIsMember(member1)).to.be.true;

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
        const defaultErasCovered = new BN("8");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(defaultErasCovered);
        expect(amount).to.be.bignumber.equal(new BN(decrease));
        expect(await getDeposit(member1)).to.be.bignumber.equal(deposit);
        return expect(await getIsMember(member1)).to.be.true;

    })

    it("member cannot schedule a decrease if they have never made a deposit", async () => {
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy })).to.be.rejectedWith('NO_DEP');
    })

    it("member cannot schedule a decrease for more than their deposit amount", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("15", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy })).to.be.rejectedWith('EXC_DEP');
    })

    it("member cannot schedule a 0 decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("0", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy })).to.be.rejectedWith('ZERO_DECR');
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await expect(ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy })).to.be.rejectedWith('DECR_EXIST');
    })

    it("member can cancel a scheduled decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("5", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.cancelDecreaseCover(member1, { from: member1Proxy });
        const { 0: era, 1: amount } = await ic.getScheduledDecrease(member1);
        expect(era).to.be.bignumber.equal(zero);
        return expect(amount).to.be.bignumber.equal(zero);
    })

    it("member can execute a scheduled decrease; deposit is updated and funds are withdrawn", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = web3.utils.toWei("3", "ether");
        const balanceEndExpected = balanceStart.add(new BN(decrease));
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit }); // deposit is sent from member1Proxy account, not member1
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: agent007 });
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        return expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
        //expect(bnToEther(await web3.eth.getBalance(member1))).to.almost.equal(bnToEther(balanceEndExpected.toString()));
    })

    it("anyone can execute a member's scheduled decrease", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("20", "ether");
        const decrease = web3.utils.toWei("13", "ether");
        const expected = web3.utils.toWei("7", "ether");
        const balanceEndExpected = balanceStart.add(new BN(decrease));
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: agent007 });
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        return expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
    })

    it("member cannot execute a scheduled decrease early", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await expect(ic.executeScheduled(member1, { from: agent007 })).to.be.rejectedWith('NOT_EXEC');
    })

    it("member cannot execute a scheduled decrease early (2)", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("20");
        await expect(ic.executeScheduled(member1, { from: agent007 })).to.be.rejectedWith('NOT_EXEC');
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await expect(ic.executeScheduled(member1, { from: agent007 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member cannot cancel a scheduled decrease if they never scheduled one", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await expect(ic.cancelDecreaseCover(member1, { from: member1Proxy })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member cannot execute a scheduled decrease early, if execute delay is updated after the fact", async () => {
        const balanceStart = new BN(await web3.eth.getBalance(member1));
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const expected = deposit;
        const balanceEndExpected = balanceStart;
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("20");
        await expect(ic.executeScheduled(member1, { from: agent007 })).to.be.rejectedWith('NOT_EXEC');
        await ic.setErasCovered("18", member1, { from: manager });
        await expect(ic.executeScheduled(member1, { from: agent007 })).to.be.rejectedWith('NOT_EXEC');
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        return expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
    })

    it("member cannot execute a cancelled decrease", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("40");
        await ic.cancelDecreaseCover(member1, { from: member1Proxy });
        await expect(ic.executeScheduled(member1, { from: agent007 })).to.be.rejectedWith('DECR_N_EXIST');
    })

    it("member cannot execute a decrease when reducible balance is not enough; memberNotPaid is set", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const transfer = web3.utils.toWei("9", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("40");
        await ic.transfer_mock(dev, transfer);
        await ic.executeScheduled(member1, { from: agent007 }); // fails silently; there is no DecreaseCoverEvent event
        return expect(await ic.memberNotPaid()).to.be.equal(member1);
    })

    it("member cannot cancel a decrease that is already cancelled", async () => {
        const deposit = web3.utils.toWei("10", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("40");
        await ic.cancelDecreaseCover(member1, { from: member1Proxy });
        await expect(ic.cancelDecreaseCover(member1, { from: member1Proxy })).to.be.rejectedWith('DECR_N_EXIST');
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
        await om.addOracleMember(member1, member1Proxy, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: member1Proxy });
        return expect(await om.eraId()).to.be.bignumber.equal(newEra);
    })



    it("oracle reports 0 points for collator; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const payoutsOwedTotal1 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[0].amount).div(new BN(web3.utils.toWei("1", "ether"))));
        const payoutsOwedTotal2 = new BN(_stake_unit_cover)
            .mul(new BN(topActiveDelegations1[1].amount).div(new BN(web3.utils.toWei("1", "ether"))));

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.setMaxEraMemberPayout(maxMemberPayout, { from: manager });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        return expect(om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 })).to.be.rejectedWith('EXCEEDS_MAX');
    })

    it("oracle reports 0 points for a non-member collator; check not affected for payout amounts, deposits, total deposit, and cover owed", async () => {
        const newEra = new BN("222");

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports positive points for 2 collators; check payout amounts, deposits, total deposit, and cover owed", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");


        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
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

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleDataThis, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
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

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleDataThis, { from: oracle1 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(payoutsOwedTotal2);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
    })

    it("oracle reports 0 points for a collator but the reducible balance is not enough; delegatorNotpaid is set", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.transfer_mock(dev, deposit); // send all the funds away 

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await ic.payOutCover([delegator1]);
        return expect(await ic.delegatorNotPaid()).to.be.equal(delegator1);
    })

    it("when delegatorNotpaid is set, it does not change when another delegator does not get paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.setDelegatorNotPaid_mock(delegator2);
        await ic.transfer_mock(dev, deposit); // send all the funds away

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await ic.payOutCover([delegator1]);
        return expect(await ic.delegatorNotPaid()).to.be.equal(delegator2);
    })

    it("delegatorNotPaid is unset when the delegator gets paid", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.setDelegatorNotPaid_mock(delegator1);

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await ic.payOutCover([delegator1]);
        return expect(await ic.delegatorNotPaid()).to.be.equal(ZERO_ADDR);
    })

    it("oracle reports 0 points for a collator without enough deposits to cover claims; member defaults", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit
        expect(await getDeposit(member1)).to.be.bignumber.equal(zero);

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        return expect(await ic.delegatorNotPaid()).to.be.equal(ZERO_ADDR); // delegatorNotPaid is not affected by collator default
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));
        const delegator2BalanceExpected = delegator2BalanceStart.add(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await om.reportPara(member1, newEra2, 1, oracleData, { from: oracle1 }); // second
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
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

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await om.reportPara(member1, newEra2, 1, oracleDataSecond, { from: oracle1 }); // second
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        const newMinPayout = payoutsOwedTotal.add(new BN(web3.utils.toWei("0.1", "ether"))); // an amount bigger than both covers owed
        await ic.setMinPayout(newMinPayout, { from: manager });
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await ic.transfer_mock(dev, deposit); // move funds away
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await ic.payOutCover([delegator1, delegator2]);
        await expect(ic.scheduleDecreaseCover(member1, deposit, { from: member1Proxy })).to.be.rejectedWith('EXC_DEP');
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await ic.payOutCover([delegator1, delegator2]);
        await ic.scheduleDecreaseCover(member1, possibleDecreaseExpected, { from: member1Proxy }); // should not throw
        const executeDelay = await ic.getErasCovered(member1, { from: agent007 });
        await ic.timetravel(1 + executeDelay);
        await ic.executeScheduled(member1, { from: agent007 }); // should not throw
    })

    it("erasCovered (same as member decrease execution delay) is calculated correctly based on a member's deposit (1)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const newEra = new BN("222");
        const refundPerEra = new BN(collators[0].delegationsTotal).mul(new BN(_stake_unit_cover)).div(new BN(web3.utils.toWei("1", "ether")))
        const erasCoveredExpected = BN.min(new BN("1080"), new BN(deposit).div(refundPerEra));

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        return expect(await ic.getErasCovered(member1, { from: agent007 })).to.be.bignumber.equal(erasCoveredExpected);
    })

    it("erasCovered (same as member decrease execution delay) is calculated correctly based on a member's deposit (2)", async () => {
        const deposit = web3.utils.toWei("1000", "ether");
        const newEra = new BN("222");
        const refundPerEra = new BN(collators[0].delegationsTotal).mul(new BN(_stake_unit_cover)).div(new BN(web3.utils.toWei("1", "ether")))
        const erasCoveredExpected = BN.min(new BN("1080"), new BN(deposit).div(refundPerEra));

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        return expect(await ic.getErasCovered(member1, { from: agent007 })).to.be.bignumber.equal(erasCoveredExpected);
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.removeDeposit_mock(member1, deposit); // delete that member's deposit
        expect(await getDeposit(member1)).to.be.bignumber.equal(zero);
        const membersDepositTotalStart = deposit;
        const membersDepositTotalexpected = new BN(deposit).add(new BN(deposit)).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });

        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero); // cover for delegator #1 was paid; only #2 remaining
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceStart); // not changed
        await ic.payOutCover([delegator1]); // nothing should change


        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero); // has not been paid out
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero); // cover for delegator #1 was paid; only #2 remaining
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceStart); // not changed

        // defaulted member makes a deposit
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await om.reportPara(member1, newEra2, 1, oracleData, { from: oracle1 });
                
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
        const balanceEndExpected = balanceStart.add(new BN(decrease));

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.setErasCovered("33", member2, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.scheduleDecreaseCover(member2, decrease, { from: member2Proxy });
        await ic.timetravel("40");
        await ic.transfer_mock(dev, transfer);

        await ic.executeScheduled(member1, { from: member1Proxy }); // fails silently
        expect(await ic.memberNotPaid()).to.be.equal(member1);
        await ic.executeScheduled(member2, { from: member2Proxy }); // fails silently
        expect(await ic.memberNotPaid()).to.be.equal(member1);

        // send back half the funds (enough to pay member1 decrease but not member2)
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: deposit });
        await ic.executeScheduled(member1, { from: agent007 });
        // make sure it was actually executed
        expect(await getDeposit(member1)).to.be.bignumber.equal(expected);
        expect(bnToEther(await web3.eth.getBalance(member1))).to.be.bignumber.almost.equal(bnToEther(balanceEndExpected));
        expect(await ic.memberNotPaid()).to.be.equal(ZERO_ADDR);
        await ic.executeScheduled(member2, { from: agent007 }); // fails silently (not enough funds)
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

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.memberSetMaxCoveredDelegation(member1, maxCoveredDelegation, { from: member1Proxy });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const delegator1BalanceExpected = delegator1BalanceStart.add(new BN(payoutsOwedTotal1));
        const delegator2BalanceExpected = delegator2BalanceStart.add(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await ic.payOutCover([delegator1, delegator2], { from: agent007 });
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(zero);
        expect(await ic.payoutAmounts(delegator2)).to.be.bignumber.equal(zero);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(zero);
        expect(await getDeposit(member1)).to.be.bignumber.equal(depositExpected);
        expect(await web3.eth.getBalance(delegator1)).to.be.bignumber.equal(delegator1BalanceExpected);
        return expect(await web3.eth.getBalance(delegator2)).to.be.bignumber.equal(delegator2BalanceExpected);
    })

    it("invoicing members results to one non-oracle-running member paying an oracle-running member the member fee", async () => {
        const deposit = new BN(web3.utils.toWei("120", "ether"));
        const invoiceEra = new BN("32");
        const memberFee = new BN(web3.utils.toWei("2", "ether"));
        const oracleDataEmpty = {
            ...oracleData,
            collators: []
        } // empty collator data to avoid trigering any claims
        const expectedDeposit1 = deposit.add(memberFee);
        const expectedDeposit2 = deposit.sub(memberFee);

        await ic.setEra_mock(invoiceEra);
        await ic.setMemberFee(memberFee, { from: manager });
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, invoiceEra, 0, oracleDataEmpty, { from: oracle1 });
        await ic.invoiceMembers({ from: delegator1 });

        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart); // total deposits have not changed
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(new BN("0")); // no funds went into total payouts
        expect(await getDeposit(member1)).to.be.bignumber.equal(expectedDeposit1); // received the fee
        return expect(await getDeposit(member2)).to.be.bignumber.equal(expectedDeposit2); // paid the fee
    })

    it("invoicing members results to two oracle-running members not getting any fees bc there are no non-oracle-running members", async () => {
        const deposit = new BN(web3.utils.toWei("120", "ether"));
        const invoiceEra = new BN("32");
        const memberFee = new BN(web3.utils.toWei("2", "ether"));
        const oracleDataEmpty = {
            ...oracleData,
            collators: []
        } // empty collator data to avoid trigering any claims
        const expectedDeposit1 = deposit;
        const expectedDeposit2 = deposit;

        await ic.setEra_mock(invoiceEra);
        await ic.setMemberFee(memberFee, { from: manager });
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();

        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, invoiceEra, 0, oracleDataEmpty, { from: oracle1 });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.reportPara(member2, invoiceEra, 0, oracleDataEmpty, { from: oracle2 });
        await ic.invoiceMembers({ from: agent007 });

        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart); // total deposits have not changed
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(new BN("0")); // no funds went into total payouts
        expect(await getDeposit(member1)).to.be.bignumber.equal(expectedDeposit1);
        return expect(await getDeposit(member2)).to.be.bignumber.equal(expectedDeposit2);
    })

    it("invoicing members results to two non-oracle-running members not getting any fees bc there are no oracle-running members", async () => {
        const deposit = new BN(web3.utils.toWei("120", "ether"));
        const invoiceEra = new BN("32");
        const memberFee = new BN(web3.utils.toWei("2", "ether"));
        const expectedDeposit1 = deposit.sub(memberFee);
        const expectedDeposit2 = deposit.sub(memberFee);

        await ic.setEra_mock(invoiceEra);
        await ic.setMemberFee(memberFee, { from: manager });
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();
        await ic.invoiceMembers({ from: agent007 });

        const membersDepositTotalAfterInvoice = new BN(membersDepositTotalStart).sub(memberFee).sub(memberFee);
        // total deposits decrease because there are no oracle-running collators to claim the fees, so they go to manager
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalAfterInvoice);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(new BN("0")); // no funds went into total payouts
        expect(await getDeposit(member1)).to.be.bignumber.equal(expectedDeposit1);
        return expect(await getDeposit(member2)).to.be.bignumber.equal(expectedDeposit2);
    })

    it("invoicing members results to an oracle-running member colelcting fees from two non-racle-running members", async () => {
        const deposit = new BN(web3.utils.toWei("120", "ether"));
        const invoiceEra = new BN("64");
        const memberFee = new BN(web3.utils.toWei("2", "ether"));
        const oracleDataEmpty = {
            ...oracleData,
            collators: []
        } // empty collator data to avoid trigering any claims
        const expectedDeposit1 = deposit.add(memberFee).add(memberFee);
        const expectedDeposit2 = deposit.sub(memberFee);
        const expectedDeposit3 = deposit.sub(memberFee);

        await ic.setEra_mock(invoiceEra);
        await ic.setMemberFee(memberFee, { from: manager });
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        await ic.whitelist(member3, member3Proxy, { from: manager });
        await ic.depositCover(member3, { from: member3Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, invoiceEra, 0, oracleDataEmpty, { from: oracle1 });
        await ic.invoiceMembers({ from: agent007 });

        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart); // total deposits have not changed
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(new BN("0")); // no funds went into total payouts
        expect(await getDeposit(member1)).to.be.bignumber.equal(expectedDeposit1); // received the fee
        expect(await getDeposit(member2)).to.be.bignumber.equal(expectedDeposit2); // paid the fee
        expect(await getDeposit(member3)).to.be.bignumber.equal(expectedDeposit3); // paid the fee
    })

    it("invoicing members results to two oracle-running members sharing the fees from one non-racle-running member", async () => {
        const deposit = new BN(web3.utils.toWei("120", "ether"));
        const invoiceEra = new BN("32");
        const memberFee = new BN(web3.utils.toWei("2", "ether"));
        const oracleDataEmpty = {
            ...oracleData,
            collators: []
        } // empty collator data to avoid trigering any claims
        const expectedDeposit1 = deposit.add(memberFee.div(new BN("2")));
        const expectedDeposit2 = deposit.add(memberFee.div(new BN("2")));
        const expectedDeposit3 = deposit.sub(memberFee);

        await ic.setEra_mock(invoiceEra);
        await ic.setMemberFee(memberFee, { from: manager });
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        await ic.whitelist(member3, member3Proxy, { from: manager });
        await ic.depositCover(member3, { from: member3Proxy, value: deposit });
        const membersDepositTotalStart = await ic.membersDepositTotal();

        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.reportPara(member2, invoiceEra, 0, oracleDataEmpty, { from: oracle2 });
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, invoiceEra, 0, oracleDataEmpty, { from: oracle1 });
        await ic.invoiceMembers({ from: agent007 });

        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalStart); // total deposits have not changed
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(new BN("0")); // no funds went into total payouts
        expect(await getDeposit(member1)).to.be.bignumber.equal(expectedDeposit1); // received 1/2 the fee
        expect(await getDeposit(member2)).to.be.bignumber.equal(expectedDeposit2); // received 1/2 the fee
        expect(await getDeposit(member3)).to.be.bignumber.equal(expectedDeposit3); // paid the fee
    })

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
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.addOracleMember(member3, oracle3, { from: oracleManager });
        await om.setVetoOracleMember(oracle3, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member3, newEra, 0, oracleData2, { from: oracle3 });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: oracle2 });
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
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.addOracleMember(member3, oracle3, { from: oracleManager });
        await om.setVetoOracleMember(oracle3, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member3, newEra, 0, oracleData2, { from: oracle3 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: oracle2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
    })

    it("oracle reports are not pushed even though veto comes after quorum was reached (waiting for veto address to report)", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.addOracleMember(member3, oracle3, { from: oracleManager });
        await om.setVetoOracleMember(oracle3, { from: oracleManager });
        await om.setLastEraVetoOracleVoted_mock(newEra);

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: oracle2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
    })

    it("oracle reports are pushed because veto comes after quorum was reached and veto has not reported for 3 eras", async () => {
        const newEra = new BN("222"); const nextEra = new BN("228");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.addOracleMember(member3, oracle3, { from: oracleManager });
        await om.setVetoOracleMember(oracle3, { from: oracleManager });
        await om.setLastEraVetoOracleVoted_mock(newEra);
        await om.setEra_mock(nextEra);

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, nextEra, 0, oracleData1, { from: oracle1 });
        const tx = await om.reportPara(member2, nextEra, 0, oracleData1, { from: oracle2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1")); // nonce increment means quorum was reached
        assert.ok(tx.receipt.rawLogs.some(l => { return l.topics[0] == '0x' + web3.utils.sha3("Oracle.ReportingCleared()") }), "Event not emitted");
    })


    it("manager cannot withdraw an amount larger than the staking rewards w/ report event", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const extraAmount = web3.utils.toWei("1", "ether");
        const newEra = new BN("222");

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await expect(ic.withdrawRewards(new BN(rewards).add(new BN(extraAmount)), manager, { from: manager }))
            .to.be.rejectedWith("NO_REWARDS");
    })

    it("manager cannot withdraw an amount larger than the staking rewards w/ cover decrease event", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const rewards = web3.utils.toWei("14", "ether");
        const decrease = web3.utils.toWei("7", "ether");
        const extraAmount = web3.utils.toWei("1", "ether");

        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.setErasCovered("33", member1, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        await ic.scheduleDecreaseCover(member1, decrease, { from: member1Proxy });
        await ic.timetravel("40");
        await ic.executeScheduled(member1, { from: member1Proxy });
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        const balanceStart = new BN(await web3.eth.getBalance(agent007));
        await ic.withdrawRewards(withdrawal, agent007, { from: manager });
        const balanceEnd = new BN(await web3.eth.getBalance(agent007));
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        console.log(`balance before delegate ${await web3.eth.getBalance(ic.address)}`)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        console.log(`balance after delegate ${await web3.eth.getBalance(ic.address)}`)

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), agent007, { from: manager }))
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        console.log(`balance before delegate ${await web3.eth.getBalance(ic.address)}`)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        console.log(`balance after delegate ${await web3.eth.getBalance(ic.address)}`)

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await ic.withdrawRewards(new BN(withdrawal), agent007, { from: manager });
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        await ds.scheduleDelegatorRevoke(candidate, { from: stakingManager });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), agent007, { from: manager }))
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        await ds.scheduleDelegatorBondLess(candidate, less, { from: stakingManager });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), agent007, { from: manager }))
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        // simulate staking rewards
        await web3.eth.sendTransaction({ to: ic.address, from: dev, value: rewards });
        // delegate almost all funds (deposits and rewards)
        await ds.delegate(candidate, delegation, candidateDelegationCount, delegatorDelegationCount, { from: stakingManager });
        await ds.scheduleDelegatorBondLess(candidate, less, { from: stakingManager });

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        await expect(ic.withdrawRewards(new BN(withdrawal), manager, { from: manager }))
            .to.be.rejectedWith("NO_REWARDS");
    })

    it("reducing quorum size results in softenQuorum and automatic pushing of report", async () => {
        const newEra = new BN("222");
        await om.setQuorum("3", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.addOracleMember(member3, oracle3, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member2, newEra, 0, oracleData, { from: oracle2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.setQuorum("2", { from: oracleManager })
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1"));
    })


    it("manager can add oracle member while sudo is true", async () => {
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        expect(await om.members(0, { from: agent007 })).to.be.equal(oracle1);
    })

    it("manager can remove oracle member while sudo is true", async () => {
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.removeOracleMember(member1, oracle1, { from: oracleManager });
        return await expect(om.members(0, { from: agent007 })).to.be.rejected;
    })

    it("manager cannot add oracle member twice", async () => {
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        return await expect(om.addOracleMember(member1, oracle1, { from: oracleManager })).to.be.rejectedWith("OM: MEMBER_EXISTS");
    })

    it("manager cannot add oracle member after sudo is removed", async () => {
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        return await expect(om.addOracleMember(member1, oracle1, { from: oracleManager })).to.be.rejectedWith("OM: N_SUDO");
    })


    it("manager cannot remove oracle member after sudo is removed", async () => {
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        return await expect(om.removeOracleMember(member1, oracle1, { from: oracleManager })).to.be.rejectedWith("OM: N_SUDO");
    })

    it("a collator can register an oracle", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: oracle1 });
        return expect(await om.members(0, { from: agent007 })).to.be.equal(oracle1);
    })

    it("a collator cannot register an oracle when no proxy precomp", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await ic.setSimulateNoProxySupport_mock(true);
        await om.setSimulateNoProxySupport_mock(true);
        return await expect(om.registerAsOracleMember(collator, { from: oracle1 })).to.be.rejectedWith('CANNOT_CALL_PROXY_PRECOMP_FROM_SC');

    })

    it("a collator can unregister their oracle and register a new one", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: oracle1 });
        await om.unregisterOracleMember(oracle1, collator, { from: oracle1 }); // any from address can be used here, but in mainnet it will have to be a Gov proxy of the collator
        await expect(om.members(0, { from: agent007 })).to.be.rejected;
        await om.registerAsOracleMember(collator, { from: oracle2 });
    })

    it("a collator cannot register the same address twice", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: oracle1 });
        return await expect(om.registerAsOracleMember(collator, { from: oracle1 })).to.be.rejectedWith("OM: MEMBER_EXISTS");
    })

    it("a collator cannot register an address that is used by another collator (this assumes two collators have the priv key of that address, i.e. one entity runs multiple collators)", async () => {
        const collator = TWO_ADDR;
        const collator2 = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: oracle1 });
        return await expect(om.registerAsOracleMember(collator2, { from: oracle1 })).to.be.rejectedWith("OM: MEMBER_EXISTS");
    })

    it("a collator cannot register two addresses", async () => {
        const collator = ONE_ADDR;
        await om.removeSudo("123456789", ONE_ADDR, TWO_ADDR, { from: oracleManager });
        await om.registerAsOracleMember(collator, { from: oracle1 });
        return await expect(om.registerAsOracleMember(collator, { from: oracle2 })).to.be.rejectedWith("OM: COLLATOR_REGISTERED");
    })

    it("must offer at least one cover (active-set or zero-points)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await expect(ic.memberSetCoverTypes(member1, false, false, { from: member1Proxy })).to.be.rejectedWith('INV_COVER');
    })

    it("can offer both covers (active-set and zero-points)", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.memberSetCoverTypes(member1, true, true, { from: member1Proxy });
    })

    it("oracle reports 0 points for collator that is not offering 0-pts-cover", async () => {
        const deposit = web3.utils.toWei("120", "ether");
        const payoutsOwedTotal1 = new BN("0");
        const payoutsOwedTotal2 = new BN("0");
        const startEra = 221;

        await ic.setEra_mock(startEra); // go to era 221
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.memberSetCoverTypes(member1, true, false, { from: member1Proxy }); // deactivate zero-pts cover
        const newEra = startEra + 138 + 1; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        const executeDelayB = await ic.getErasCovered(member1, { from: agent007 });
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.memberSetCoverTypes(member1, false, true, { from: member1Proxy }); // deactivate zero-pts cover
        const newEra = startEra + 138 + 1; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        const executeDelayB = await ic.getErasCovered(member1, { from: agent007 });
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.memberSetCoverTypes(member1, false, true, { from: member1Proxy }); // deactivate zero-pts cover
        const executeDelay = await ic.getErasCovered(member1, { from: agent007 });
        console.log({ executeDelay: executeDelay.toString() })
        await ic.timetravel(1 + executeDelay); // move to an era where zero-pts cover is now deactivated
        const newEra = startEra + 1 + executeDelay;

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
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
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.memberSetCoverTypes(member1, false, true, { from: member1Proxy }); // deactivate zero-pts cover
        const newEra = startEra + 20; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1).add(new BN(payoutsOwedTotal2));
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1)).sub(new BN(payoutsOwedTotal2));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData, { from: oracle1 });
        const executeDelayB = await ic.getErasCovered(member1, { from: agent007 });
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
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });
        await ic.memberSetCoverTypes(member2, true, false, { from: member2Proxy }); // deactivate zero-pts cover
        const newEra = startEra + 20; // see below for how to get this number

        const membersDepositTotalStart = await ic.membersDepositTotal();
        const membersDepositTotalexpected = new BN(membersDepositTotalStart).sub(new BN(payoutsOwedTotal1));
        const payoutsOwedTotal = new BN(payoutsOwedTotal1);
        const depositExpected = new BN(deposit).sub(new BN(payoutsOwedTotal1));

        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        const executeDelayB = await ic.getErasCovered(member2, { from: agent007 });
        console.log({ executeDelayB: executeDelayB.toString() }) //  we get 138, and we make sure 20 < 138
        expect(await ic.payoutAmounts(delegator1)).to.be.bignumber.equal(payoutsOwedTotal1);
        expect(await ic.membersDepositTotal()).to.be.bignumber.equal(membersDepositTotalexpected);
        expect(await ic.payoutsOwedTotal()).to.be.bignumber.equal(payoutsOwedTotal);
        return expect(await getDeposit(member2)).to.be.bignumber.equal(depositExpected);
    })

    /*it("oracle data cannot be pushed twice for same collator, in quorum of 2", async () => {
        const newEra = new BN("222");
        const deposit = web3.utils.toWei("120", "ether");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await ic.whitelist(member1, member1Proxy, { from: manager });
        await ic.depositCover(member1, { from: member1Proxy, value: deposit });
        await ic.whitelist(member2, member2Proxy, { from: manager });
        await ic.depositCover(member2, { from: member2Proxy, value: deposit });

        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member2, newEra, 1, oracleData1, { from: oracle2 });
        await om.reportPara(member1, newEra, 2, oracleData1, { from: oracle1 });
        return expect(om.reportPara(member2, newEra, 2, oracleData1, { from: oracle2 })).to.be.rejectedWith('OLD_MEMBER_ERA');
    })*/

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
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member1, newEra, 1, oracleData2, { from: oracle1 });
        return expect(await om.eraId()).to.be.bignumber.equal(newEra);
    })

    it("oracle data cannot be pushed twice by the same member", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        return await expect(om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 })).to.be.rejectedWith('OR: INV_NONCE');
    })

    /*it("oracle data cannot be pushed twice for same collator", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        return await expect(om.reportPara(member1, newEra, 2, oracleData1, { from: oracle1 })).to.be.rejectedWith('OLD_MEMBER_ERA');
    })*/



    it("oracle data cannot be pushed twice until quorum reached", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        return await expect(om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 })).to.be.rejectedWith('OR: ALREADY_SUBMITTED');
    })

    it("oracle quorum of 2 reports two parts, eraNonce and point bitmaps are updated correctly", async () => {
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('0', 2));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('1', 2));
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('0', 2));
        await om.reportPara(member2, newEra, 0, oracleData1, { from: oracle2 });
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('1', 2));
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1"));
        await om.reportPara(member1, newEra2, 1, oracleData1, { from: oracle1 });
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('11', 2));
        await om.reportPara(member2, newEra2, 1, oracleData1, { from: oracle2 });
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('101', 2));
        return expect(await or.eraNonce()).to.be.bignumber.equal(new BN("2"));
    })

    it("when an oracle reports an eraNonce that has concluded, the tx fails", async () => {
        const newEra = new BN("222");
        const oracleData1 = {
            ...oracleData,
            collators: [oracleData.collators[0]]
        }
        await om.setQuorum("2", { from: oracleManager })
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.addOracleMember(member3, oracle3, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('0', 2));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: oracle2 });
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1"));
        // oracle3 sends the same report, but quorum has been met; this may happeb if the eraNonce that the oracle has read from the contract is no longer current
        return expect(om.reportPara(member3, newEra, 0, oracleData1, { from: oracle3 })).to.be.rejectedWith('OR: INV_NONCE');
    })

    it("oracle reports four parts over two rounds, eraNonce and point bitmaps are updated correctly", async () => {
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
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.addOracleMember(member2, oracle2, { from: oracleManager });

        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("0"));
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member2, newEra, 0, oracleData1, { from: oracle2 });
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('1', 2));
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('1', 2));
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("1"));
        await om.reportPara(member1, newEra, 1, oracleData2, { from: oracle1 });
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('11', 2)); // set bit
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('10', 2)); // shifted
        await om.reportPara(member2, newEra, 1, oracleData2, { from: oracle2 });
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('110', 2)); // shifted
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('101', 2)); // set bit
        expect(await or.eraNonce()).to.be.bignumber.equal(new BN("2"));
        await om.reportPara(member1, newEra2, 2, oracleData2, { from: oracle1 });
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('11001', 2)); // shifted, and set bit
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('101', 2));
        await om.reportPara(member2, newEra2, 2, oracleData2, { from: oracle2 });
        expect(await om.getOraclePointBitmap(member1, { from: agent007 })).to.be.bignumber.equal(new BN('11001', 2));
        expect(await om.getOraclePointBitmap(member2, { from: agent007 })).to.be.bignumber.equal(new BN('10101', 2)); // shifted, and set bit
        return expect(await or.eraNonce()).to.be.bignumber.equal(new BN("3"));
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
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        return await expect(om.reportPara(member1, newEra, 0, oracleData2, { from: oracle1 })).to.be.rejectedWith('OR: ALREADY_SUBMITTED');
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
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member1, newEra, 1, oracleData2, { from: oracle1 });
        await expect(await om.eraId()).to.be.bignumber.equal(newEra);
        await om.reportPara(member1, newEra2, 2, oracleData1, { from: oracle1 });
        await om.reportPara(member1, newEra2, 3, oracleData2, { from: oracle1 });
        return expect(await om.eraId()).to.be.bignumber.equal(newEra2);
    })

    it("oracle data is not pushed when report has finalize = false", async () => {
        const newEra = new BN("222");
        const newEra2 = new BN("223");
        const oracleData1 = {
            ...oracleData,
            finalize: false,
            collators: [oracleData.collators[0]]
        }
        const oracleData1f = {
            ...oracleData,
            finalize: true,
            collators: [oracleData.collators[0]]
        }
        const oracleData2 = {
            ...oracleData,
            collators: [oracleData.collators[1]]
        }
        await om.addOracleMember(member1, oracle1, { from: oracleManager });
        await om.reportPara(member1, newEra, 0, oracleData1, { from: oracle1 });
        await om.reportPara(member1, newEra, 0, oracleData1f, { from: oracle1 });
        await om.reportPara(member1, newEra, 1, oracleData2, { from: oracle1 });
        return expect(await om.eraId()).to.be.bignumber.equal(newEra);
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

        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.reportPara(member2, newEra, 0, oracleDataThis, { from: oracle2, gas: "10000000" });
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

        await om.addOracleMember(member2, oracle2, { from: oracleManager });
        await om.reportPara(member2, newEra, 0, oracleDataThis, { from: oracle2, gas: "10000000" });
        return expect(await getDeposit(member2)).to.be.bignumber.above(new BN("0"));
    })
})
