// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;
pragma abicoder v2;

import "@openzeppelin/contracts/security/Pausable.sol";

import "../interfaces/IOracle.sol";
import "../interfaces/IAuthManager.sol";
import "../interfaces/IProxy.sol";
import "../interfaces/StakingInterface.sol";

contract OracleMaster is Pausable {
    event MemberAdded(address member);
    event MemberRemoved(address member);
    event QuorumChanged(uint8 QUORUM);
    event SudoRemoved();

    ParachainStaking public staking;
    IProxy public proxy;

    // current era id
    uint128 public eraId;

    // Oracle members
    address[] public members;

    // inactivity cover contract address
    address payable public INACTIVITY_COVER;
    // auth manager contract address
    address public AUTH_MANAGER;
    // oracle master contract
    address public ORACLE;

    // Quorum threshold
    uint8 public QUORUM;

    /// Maximum number of oracle committee members
    uint256 public constant MAX_MEMBERS = 100;

    // Missing member index
    uint256 internal constant MEMBER_N_FOUND = type(uint256).max;

    // General oracle manager role
    bytes32 internal constant ROLE_PAUSE_MANAGER =
        keccak256("ROLE_PAUSE_MANAGER");

    // Oracle members manager role
    bytes32 internal constant ROLE_ORACLE_MEMBERS_MANAGER =
        keccak256("ROLE_ORACLE_MEMBERS_MANAGER");

    // Oracle members manager role
    bytes32 internal constant ROLE_ORACLE_QUORUM_MANAGER =
        keccak256("ROLE_ORACLE_QUORUM_MANAGER");

    // Manager role
    bytes32 internal constant ROLE_MANAGER = keccak256("ROLE_MANAGER");

    // Collators to oracle representatives (each collator can have one oracle rep)
    mapping(address => address) public collatorsToOracles;
    // reverse of above
    mapping(address => address) public oraclesToCollators;

    // Collator bitmaps of nonces they submitted
    mapping(address => uint32) public oraclePointBitmaps;

    // This address can veto a quorum decission; this means that:
    // 1) the address cannot vote in a report by itself, but
    // 2) the quorum-voted report must match this addresse's report for it to pass
    // 3) the address must vote for a report to pass, unless the address has not voted for the last 3 rounds
    address public vetoOracleMember;
    // the last era when the veto oracle submitted a vote
    uint128 lastEraVetoOracleVoted;

    // Allows the oracle manager to add/remove oracles at will
    bool sudo = true;

    // Allows function calls only from member with specific role
    modifier auth(bytes32 role) {
        require(IAuthManager(AUTH_MANAGER).has(role, msg.sender), "OM: UNAUTH");
        _;
    }

    // Allows function calls only from INACTIVITY_COVER
    modifier onlyInactivityCover() {
        require(
            msg.sender == INACTIVITY_COVER,
            "OM: CALLER_N_INACTIVITY_COVER"
        );
        _;
    }

    /**
     @notice Initialize oracle master contract, allowed to call only once
     @param _quorum inital quorum threshold
     */
    function initialize(
        address _auth_manager,
        address _oracle,
        address payable _inactivity_cover,
        uint8 _quorum
    ) external {
        require(
            ORACLE == address(0) && _oracle != address(0),
            "ALREADY_INITIALIZED"
        );
        require(_quorum > 0 && _quorum <= MAX_MEMBERS, "OM: INCORRECT_QUORUM");
        staking = ParachainStaking(0x0000000000000000000000000000000000000800);
        proxy = IProxy(0x000000000000000000000000000000000000080b);
        AUTH_MANAGER = _auth_manager;
        ORACLE = _oracle;
        INACTIVITY_COVER = _inactivity_cover;
        QUORUM = _quorum;
    }

    /// ***************** ORACLE MANAGER FUNCTIONS *****************

    /**
    @notice Set the number of exactly the same reports needed to finalize the era
    @param _quorum new value of quorum threshold
    */
    function setQuorum(uint8 _quorum)
        external
        auth(ROLE_ORACLE_QUORUM_MANAGER)
    {
        require(
            _quorum > 0 && _quorum < MAX_MEMBERS,
            "OM: QUORUM_WONT_BE_MADE"
        );
        uint8 oldQuorum = QUORUM;
        QUORUM = _quorum;

        // If the QUORUM value was lowered, check existing reports whether it is time to push
        if (oldQuorum > _quorum) {
            IOracle(ORACLE).softenQuorum(_quorum, eraId);
        }
        emit QuorumChanged(_quorum);
    }

    /**
     @notice Add new member to the oracle member committee list
     @dev The manager can register a collator - oracleMember pair, i.e. an oracle address that represents a collator.
     This method can be called by the manager while sudo is still true, to add oracle members. Both provided
     collator and oracleMember addresses must be unique. If already used, manager must first remove member.
     Oracle members are responsible for reporting delegator and collator data, which means they have the power to
     move debit collators and credit delegators. Sudo power allows the manager to control the oracles and therefore,
     control debits/credits. However, sudo is also needed in order to bootstrap the initial set of oracles. Moreover,
     sudo is required until Moonbeam enables access to the proxy precompile. The precompile will allow collators to be
     able to self-register and create one oracle each, effectively outsourcing member management to the active set
     selection algorithm.
     @param _collator the collator that this oracle will represent. This value becomes significant after sudo is removed.
     Before sudo, the collator parameter can take any value and submitting reports will still work. After sudo is removed,
     the collator address must be a valid, active-set, collator address or else reporting will not work.
     @param _oracleMember proposed member address
     */
    function addOracleMember(address _collator, address _oracleMember)
        external
        auth(ROLE_ORACLE_MEMBERS_MANAGER)
    {
        require(sudo, "OM: N_SUDO");
        require(_oracleMember != address(0), "OM: ORACLE_EXISTS");
        require(
            _getMemberId(_oracleMember) == MEMBER_N_FOUND,
            "OM: MEMBER_EXISTS"
        );
        require(members.length < MAX_MEMBERS, "OM: MEMBERS_TOO_MANY");
        require(
            collatorsToOracles[_collator] == address(0),
            "OM: COLLATOR_EXISTS"
        );

        members.push(_oracleMember);
        collatorsToOracles[_collator] = _oracleMember;
        oraclesToCollators[_oracleMember] = _collator;
        emit MemberAdded(_oracleMember);
    }

    /**
     @notice Remove collator and oracleMember pair from oracles
     @dev Provided collator and oracleMember must already be registered and paired. Removal will remove the capacity of that
     oracle to submit reports. This method, like addOracleMember, is disabled after sudo is removed.
     */
    function removeOracleMember(address _collator, address _oracleMember)
        external
        auth(ROLE_ORACLE_MEMBERS_MANAGER)
    {
        require(sudo, "OM: N_SUDO");
        uint256 index = _getMemberId(_oracleMember);
        require(index != MEMBER_N_FOUND, "OM: MEMBER_N_FOUND");
        require(
            collatorsToOracles[_collator] == _oracleMember,
            "OM: N_COLLATOR"
        );

        uint256 last = members.length - 1;
        if (index != last) members[index] = members[last];
        members.pop();
        delete collatorsToOracles[_collator];
        delete oraclesToCollators[_oracleMember];
        emit MemberRemoved(_oracleMember);
    }

    /**
     * @notice Oracle data can be pushed to other contracts in the future, although care must be taken to not exceed max tx gas
     */
    function addRemovePushable(address payable _pushable, bool _toAdd)
        external
        auth(ROLE_ORACLE_MEMBERS_MANAGER)
    {
        IOracle(ORACLE).addRemovePushable(_pushable, _toAdd);
    }

    /**
     @notice Delete data for current era nonce, can be used by manager to troublesoot a contested era
     @dev Results in incrementing the era nonce and thus skipping the current era nonce forever
     */
    function clearReporting() external auth(ROLE_ORACLE_MEMBERS_MANAGER) {
        require(sudo, "OM: N_SUDO");
        IOracle(ORACLE).clearReporting();
    }

    /**
    @notice While sudo is true, the manager can add and remove oracle members at will
    @dev Sudo allows the manager to control oracle membership. Removal of sudo is one-way and cannot be undone.
    After sudo is removed, only active-set collators will be able to register and run oracles (one each).
    Previous, manager-added oracles, will not work, unless they are Gov proxies of their collators.
    The manager should remove sudo as soon as
    A) the proxy precompile becomes accessible by the contract (runtime upgrade required), and
    B) there are enough Gov proxy (self-registered) oracles running
    @param code A code=123456789 to avoid accidental calling of the method
    @param _someCollator provide any random active-set collator; used to confirm the proxy precompile is accessible
    @param _itsProxy provide a governance proxy o that collator; used to confirm the proxy precompile is accessible
    */
    function removeSudo(
        uint256 code,
        address _itsProxy,
        address _someCollator
    ) external auth(ROLE_ORACLE_MEMBERS_MANAGER) {
        require(code == 123456789, "INV_CODE");
        // the following check is used to make sure the proxy precompile has become accessible
        // this is necessary, as removal od sudo and a non-accessible proxy precompile, would brick the contract from reporting
        require(
            _isProxyOfSelectedCandidate(_itsProxy, _someCollator),
            "OM: PROXY_NOT_ENABLED"
        );
        sudo = false;
        emit SudoRemoved();
    }

    /**
    @notice Set the veto oracle address; this address has the ability to veto a quorum decission
    @dev In order to guard against the quorum being overtaken by malicious collators that then submit false reports,
    we allow one address, controlled by StakeBaby, to be able to veto the quorum-agreed report.
    veto-ing means rejecting a quorum-agreed report. Veto power does not allow voting in a report, just voting it out.
    Veto is applied automatically when this address votes, i.e. the quorum-voted report must be the same as the report
    submitted by the veto address, for it to pass. If the veto address has not voted yet and a quorum has been reached,
    the report will not be pushed until the veto address also votes. To guard against a failing veto oracle, the requirement
    for a veto address to vote is removed if the veto address does not vote for 3 rounds. If the veto oracle returns,
    the round counter is reset and veto capacity resumes.
    @param _vetoOracleMember the veto oracle member. Set to zero address to disable.
    */
    function setVetoOracleMember(address _vetoOracleMember)
        external
        auth(ROLE_ORACLE_MEMBERS_MANAGER)
    {
        require(
            _getMemberId(_vetoOracleMember) != MEMBER_N_FOUND ||
                _vetoOracleMember == address(0),
            "OM: MEMBER_N_FOUND"
        );
        vetoOracleMember = _vetoOracleMember;
    }

    /**
     * @notice Stop pool routine operations (reportPara), allowed to call only by ROLE_PAUSE_MANAGER
     */
    function pause() external auth(ROLE_PAUSE_MANAGER) {
        _pause();
    }

    /**
     * @notice Resume pool routine operations (reportPara), allowed to call only by ROLE_PAUSE_MANAGER
     */
    function resume() external auth(ROLE_PAUSE_MANAGER) {
        _unpause();
    }

    /// ***************** ORACLE MEMBER FUNCTIONS *****************

    /**
     @notice Each active collator can register one address with oracle privileges. The address must be a Governance proxy of the collator at the time of registration, to prove that it is owned by that collator.
     @dev Collators that want to run an oracle, can call this function to register their intention and be able to push reports.
     The oracle must remain a Gov proxy of the collator, and the collator must remain in the active set, to be able to continue submitting reports.
     Each collator can register only one oracle. Non-collators cannot register oracle addresses. This allows for a decentralized management
     of the oracle set that can function without the need for an oracle member manager. Not all collators are likely to run oracles, but those offering cover should run an oracle
     to protect their assets. The method can be called after sudo is removed, and member management has passed to the collator active set.
     @param _collator the collator that the caller represents (each collator can operate one oracle)
     */
    function registerAsOracleMember(address _collator) external {
        require(!sudo, "OM: SUDO");
        require(
            _getMemberId(msg.sender) == MEMBER_N_FOUND,
            "OM: MEMBER_EXISTS"
        );
        require(members.length < MAX_MEMBERS, "OM: MEMBERS_TOO_MANY");
        require(
            _isProxyOfSelectedCandidate(msg.sender, _collator),
            "OM: N_COLLATOR_PROXY"
        );
        require(
            collatorsToOracles[_collator] == address(0),
            "OM: COLLATOR_REGISTERED"
        ); // ensures that each collator can register one oracle only

        members.push(msg.sender);
        collatorsToOracles[_collator] = msg.sender;
        oraclesToCollators[msg.sender] = _collator;
        emit MemberAdded(msg.sender);
    }

    /**
     @notice Remove _oracleMember from the oracle member committee list
     @dev By removing the account, the oracle can no longer submit reports. May be used by collators that want to unregister
     an oracle address to register a new one. Can be called only after sudo is removed.
     @param _collator the collator that the caller represents
     */
    function unregisterOracleMember(address _oracleMember, address _collator)
        external
    {
        require(!sudo, "OM: SUDO");
        // Any address that is a Gov proxy of this collator can remove that collator's oracle
        // This allows collators that lost their oracle's private key to recover and create a new oracle
        require(
            _isProxyOfSelectedCandidate(msg.sender, _collator),
            "OM: N_COLLATOR_PROXY"
        );
        uint256 index = _getMemberId(_oracleMember);
        require(index != MEMBER_N_FOUND, "OM: MEMBER_N_FOUND");
        require(
            collatorsToOracles[_collator] == _oracleMember,
            "OM: N_COLLATOR"
        );

        uint256 last = members.length - 1;
        if (index != last) members[index] = members[last];
        members.pop();
        delete collatorsToOracles[_collator];
        delete oraclesToCollators[_oracleMember];
        emit MemberRemoved(_oracleMember);
    }

    /**
     @notice Submit oracle reports
     @dev Oracle reports contain information about collators and delegators. Each report includes information for a specific round
     and for specific collator/s and their delegators. The report does not have to include all the collator+delegator data for a specific
     round. For example, a report may include information for only one collator and its delegators. A subsequent report (for the same round)
     may include information about another collator and its delegators (cannot be the same collator). This allows oracles to break
     up reports in multiple parts and avoid maxing out on gas. Oracles break up reports in a deterministic way so that their reports can match.
     To identify which report a collator must send, for a specific round, it checks the current eraNonce and submits a report for that nonce.
     In the example we just mentioned, the first report sent by oracle A was for nonce 777 and the second report sent by the same oracle
     was for nonce 778. Oracles always send reports for the current nonce. This means that ab oracle may skip a nonce if a quorum has already
     been reached for that nonce.
     @param _collator The collator that this oracle represents (each collator can run one oracle - each oracle is represented by at most one collator)
     @param _eraId parachain round
     @param _eraNonce era nonce
     @param _report collator status/points data report
     */
    function reportPara(
        address _collator,
        uint128 _eraId,
        uint128 _eraNonce,
        Types.OracleData calldata _report
    ) external whenNotPaused {
        // Because reports can result in fund transfers, no single entity should control them, including manager.
        // However, the manager needs sudo access in the beginning to bootstrap oracles until the total oracle number is large enough.
        // To secure the initial bootstrapping and longterm security, we use a sudo key which allows the manager to add/remove oracles.
        // After sudo is removed, every oracle must be a Gov proxy of an active collator to be able to push reports.
        // This means that ONLY collators can run oracles (one each) and by extension the manager can also run only one oracle.
        uint256 memberIndex = _getMemberId(msg.sender);
        require(
            memberIndex != MEMBER_N_FOUND &&
                (sudo || _isProxyOfSelectedCandidate(msg.sender, _collator)),
            "OM: MEMBER_N_FOUND"
        );
        require(collatorsToOracles[_collator] == msg.sender, "OM: N_COLLATOR");
        // Oracles always report the last completed era (round)
        // Is a quorum of the previous era is not reached during the current era, the opportunity to process cover claims for the previous era is lost forever
        require(_isLastCompletedEra(_eraId), "OM: INV_ERA");
        require(_isConsistent(_report), "OM: INCORRECT_REPORT");

        if (_eraId > eraId) {
            eraId = _eraId;
        }

        // ORACLE POINTS EMPTYING (left shift)
        // By shifting the points bitmap to the left by 1, we are gradually pushing the 1's off the uint32 cliff
        // If the collator does not "refill" its points bitmap with 1's, then, eventually, all 1's will be shifted out and only 0's will be left
        // On each era nonce and memberIndex, we choose a different collator to shift its points bitmap (collators are chosen on a rolling basis)
        // Our goal is that all collators are bit-shited the same, on average, over many era nonces
        // To do this, we mod the sum of the eraNonce and memberIndex; thus, even if a collator is not shifted in this era nonce,
        // (because the oracle that had the right memberIndex did not make it into the quorum) chances are it will be shifted in the next nonce
        address oracleMemberToShiftPoints = members[(_eraNonce + memberIndex) % members.length];
        address collatorMemberToShiftPoints = oraclesToCollators[oracleMemberToShiftPoints];
        oraclePointBitmaps[collatorMemberToShiftPoints] = oraclePointBitmaps[collatorMemberToShiftPoints] << 1;

        // ORACLE POINTS FILLING (left shift + 1 at 0)
        // Every time an oracle member submits a report, we shift the points bitmap to the left and add a 1 at index 0
        // This has the effect of gradually "filling" the points bitmap with 1's (from the right to the left)
        // An oracle may not get a chance to submit a report for a specific era nonce, if, for example the quorum was already reached, or it was down
        // This is OK because oracle members only need to report for 1 eraNonce to qualify their collators as oracle-running members
        // This also means that an oracle may miss all reports out of bad luck. The manager will ensure that the quorum
        // is large enough to minimize this probability; however, it cannot be zeroed out. Fortunately, the only effect that it will
        // have is that, on rare occasions, the oracle-running member will pay the non-oracle-running member fee.
        uint32 tempBitmap = oraclePointBitmaps[_collator];
        tempBitmap = tempBitmap << 1;
        tempBitmap = tempBitmap | (1 << 0);
        oraclePointBitmaps[_collator] = tempBitmap;
 
        bool veto = vetoOracleMember == msg.sender;
        if (veto) {
            lastEraVetoOracleVoted = _eraId;
        }
        // if the veto address has not reported for the last 3 rounds, then disable vetoing
        bool vetoDisabled = _eraId - lastEraVetoOracleVoted > 3;

        IOracle(ORACLE).reportPara(
            memberIndex,
            QUORUM,
            _eraId,
            _eraNonce,
            _report,
            _collator,
            veto,
            vetoDisabled
        );
    }

    /// ***************** FUNCTIONS CALLABLE BY ANYBODY *****************

    /**
     @notice Return last reported era and oracle is already reported indicator
     @param _oracleMember - oracle member address
     @return lastEra - last reported era
     @return lastPart - last reported era part
     @return isReported - true if oracle member already reported for given stash, else false
     */
    function isReportedLastEra(address _oracleMember)
        external
        view
        returns (
            uint128 lastEra,
            uint128 lastPart,
            bool isReported
        )
    {
        lastEra = eraId;
        uint256 memberIdx = _getMemberId(_oracleMember);
        if (memberIdx == MEMBER_N_FOUND) {
            return (lastEra, lastPart, false);
        }
        return (lastEra, lastPart, IOracle(ORACLE).isReported(memberIdx));
    }

    /// ***************** GETTERS *****************

    /**
     * @notice Return oracle contract for the given ledger
     * @return linked oracle address
     */
    function getOracle() external view returns (address) {
        return ORACLE;
    }

    function getOraclePointBitmap(address _oracleMember) external view returns(uint32) {
        return oraclePointBitmaps[_oracleMember];
    }

    /// ***************** INTERNAL FUNCTIONS *****************

    /// @notice Return true if report is consistent
    function _isConsistent(Types.OracleData memory report)
        internal
        pure
        returns (bool)
    {
        uint256 collatorsWithZeroPoints = 0;
        for (uint256 i = 0; i < report.collators.length; i++) {
            if (report.collators[i].points == 0) {
                collatorsWithZeroPoints++;
            }
        }
        return
            report.round > 0 &&
            report.totalStaked > 0 &&
            report.totalSelected > 0 &&
            report.awarded > 0 &&
            report.blockNumber > 0;
    }

    /**
     * @notice Return oracle instance index in the member array
     * @param _oracleMember member address
     * @return member index
     */
    function _getMemberId(address _oracleMember)
        internal
        view
        returns (uint256)
    {
        uint256 length = members.length;
        for (uint256 i = 0; i < length; ++i) {
            if (members[i] == _oracleMember) {
                return i;
            }
        }
        return MEMBER_N_FOUND;
    }

    /**
    @notice Returns true if the oracleMember is a Gov proxy of the collator, and the collator is a selected candidate
    @dev used by auth method to check if the caller has been authorized as a proxy by an active-set collator
    */
    function _isProxyOfSelectedCandidate(
        address _oracleMember,
        address _collator
    ) internal view virtual returns (bool) {
        bool isCollator = staking.isSelectedCandidate(_collator);
        bool isProxy = proxy.isProxy(
            _collator,
            _oracleMember,
            IProxy.ProxyType.Governance,
            0
        );
        return isCollator && isProxy;
    }

    function _getEra() public view virtual returns (uint128) {
        return uint128(staking.round());
    }

    function _isLastCompletedEra(uint128 _eraId)
        internal
        view
        virtual
        returns (bool)
    {
        return _getEra() - _eraId == 1;
    }
}
