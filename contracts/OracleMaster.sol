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

    // Collator report counts
    mapping(address => uint256) public reportCounts;

    // Allows the oracle manager to add/remove oracles at will
    bool sudo = true;

    // This address can veto a quorum decission; this means that:
    // 1) the address cannot vote in a report by itself, but
    // 2) the quorum-voted report must match this addresse's report for it to pass
    // If the address does not push a report, then its veto ability is not exercised during that round nonce
    address public vetoOracleMember;

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
     * @notice Initialize oracle master contract, allowed to call only once
     * @param _quorum inital quorum threshold
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
    * @notice Set the number of exactly the same reports needed to finalize the era
              allowed to call only by ROLE_ORACLE_QUORUM_MANAGER
    * @param _quorum new value of quorum threshold
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

        // If the QUORUM value lowered, check existing reports whether it is time to push
        if (oldQuorum > _quorum) {
            IOracle(ORACLE).softenQuorum(_quorum, eraId);
        }
        emit QuorumChanged(_quorum);
    }

    /**
     * @notice Add new member to the oracle member committee list, allowed to call only by ROLE_ORACLE_MEMBERS_MANAGER
     * @param _oracleMember proposed member address
     */
    function addOracleMember(address _oracleMember)
        external
        auth(ROLE_ORACLE_MEMBERS_MANAGER)
    {
        require(sudo, "OM: N_SUDO");
        require(_oracleMember != address(0), "OM: BAD_ARGUMENT");
        require(
            _getMemberId(_oracleMember) == MEMBER_N_FOUND,
            "OM: MEMBER_EXISTS"
        );
        require(members.length < MAX_MEMBERS, "OM: MEMBERS_TOO_MANY");

        members.push(_oracleMember);
        emit MemberAdded(_oracleMember);
    }

    /**
     * @notice Remove `_member` from the oracle member committee list, allowed to call only by ROLE_ORACLE_MEMBERS_MANAGER
     */
    function removeOracleMember(address _oracleMember)
        external
        auth(ROLE_ORACLE_MEMBERS_MANAGER)
    {
        require(sudo, "OM: N_SUDO");
        uint256 index = _getMemberId(_oracleMember);
        require(index != MEMBER_N_FOUND, "OM: MEMBER_N_FOUND");
        uint256 last = members.length - 1;
        if (index != last) members[index] = members[last];
        members.pop();
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
     * @notice Delete interim data for current Era, free storage memory for each oracle; can be used by manager to troublesoot a contested era
     */
    function clearReporting() external auth(ROLE_ORACLE_MEMBERS_MANAGER) {
        require(sudo, "OM: N_SUDO");
        IOracle(ORACLE).clearReporting();
    }

    function removeSudo() external auth(ROLE_ORACLE_MEMBERS_MANAGER) {
        sudo = false;
    }

    function setVetoOracleMembet(address _vetoOracleMember)
        external
        auth(ROLE_ORACLE_MEMBERS_MANAGER)
    {
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
     * @notice Each active collator can register one address with oracle privileges. The address must be a Governance proxy of the collator at the time of registration, to prove that it is owned by that collator.
     * @param _collator the collator that the caller represents (each collator can operate one oracle)
     */
    function registerAsOracleMember(address _collator) external {
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
        emit MemberAdded(msg.sender);
    }

    /**
     * @notice Remove _oracleMember from the oracle member committee list
     * @param _collator the collator that the caller represents
     */
    function unregisterOracleMember(address _oracleMember, address _collator)
        external
    {
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
        emit MemberRemoved(_oracleMember);
    }

    /**
     * @notice Accept oracle committee member reports
     * @param _collator The collator that this oracle represents (each collator can run one oracle - each oracle is represented by at most one collator)
     * @param _eraId parachain round
     * @param _eraNonce era nonce
     * @param _report collator status/points data report
     */
    function reportPara(
        address _collator,
        uint128 _eraId,
        uint128 _eraNonce,
        Types.OracleData calldata _report
    ) external whenNotPaused {
        require(_isConsistent(_report), "OM: INCORRECT_REPORT");
        uint256 memberIndex = _getMemberId(msg.sender);
        require(memberIndex != MEMBER_N_FOUND, "OM: MEMBER_N_FOUND");
        require(_isLastCompletedEra(_eraId), "OM: INV_ERA");
        // Because reports can result in fund transfers, no single entity should control them, including manager.
        // However, the manager needs sudo access in the beginning to bootstrap oracles until the total oracle number is large enough.
        // To secure the initial bootstrapping and longterm security, we use a sudo key which allows the manager to add/remove oracles.
        // After sudo is removed, every oracle must be a Gov proxy of an active collator to be able to push reports.
        // This means that ONLY collators can run oracles (one each) and by extension the manager can also run only one oracle.
        require(
            _isProxyOfSelectedCandidate(msg.sender, _collator) || sudo,
            "OM: N_COLLATOR_PROXY"
        );

        if (_eraId > eraId) {
            eraId = _eraId;
        }
        reportCounts[_collator]++;
        bool veto = vetoOracleMember == _collator;
        IOracle(ORACLE).reportPara(
            memberIndex,
            QUORUM,
            _eraId,
            _eraNonce,
            _report,
            msg.sender,
            veto
        );
    }

    /// ***************** FUNCTIONS CALLABLE BY ANYBODY *****************

    /**
     * @notice Return last reported era and oracle is already reported indicator
     * @param _oracleMember - oracle member address
     * @return lastEra - last reported era
     * @return lastPart - last reported era part
     * @return isReported - true if oracle member already reported for given stash, else false
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
            report.blockNumber > 0 &&
            report.collators.length > 0;
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
