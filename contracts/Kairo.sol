// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AccessControlEnumerable} from "@openzeppelin/contracts/access/extensions/AccessControlEnumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Frozen role badges, sponsored publication and soulbound attendance minting.
contract Kairo is ERC721, AccessControlEnumerable {
    bytes32 public constant PANEL_ADMIN_ROLE = keccak256("PANEL_ADMIN_ROLE");
    address public superAdmin;
    address public pendingSuperAdmin;
    address public immutable relayer;
    uint256 public nextTokenId = 1;
    mapping(uint256 => uint256) public eventFor;
    mapping(uint256 => address) public eventAdmin;
    mapping(uint256 => mapping(address => bool)) public eventIssuers;
    error UnauthorizedEvent();
    event EventPauseUpdated(uint256 indexed eventId, bool paused);
    event EventIssuerUpdated(uint256 indexed eventId, address indexed issuer, bool allowed);
    event SuperAdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event SuperAdminTransferred(address indexed previousAdmin, address indexed newAdmin);

    struct EventData {
        string uri;
        uint64 cap;
        uint64 minted;
        uint64 startsAt;
        uint64 endsAt;
        bool paused;
    }
    mapping(uint256 => EventData) public events;
    mapping(uint256 => mapping(address => uint256)) public tokenFor;
    uint256 public nextEventId = 1;

    error InvalidEvent();
    error NotEligible();
    event EventCreated(uint256 indexed eventId, string uri);
    event AttendanceMinted(uint256 indexed eventId, address indexed attendee, uint256 tokenId);

    constructor(address admin, address sponsor, address previous) ERC721("Kairo Attendance", "KAIRO") {
        require(admin != address(0) && sponsor != address(0), "Zero authority");
        superAdmin = admin; relayer = sponsor;
        // Preserve global IDs so a replacement cannot collide with existing listings or badges.
        if (previous != address(0)) {
            nextEventId = Kairo(previous).nextEventId();
            nextTokenId = Kairo(previous).nextTokenId();
        }
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function proposeSuperAdmin(address nextAdmin) external {
        if (msg.sender != superAdmin) revert UnauthorizedEvent();
        require(nextAdmin != address(0) && nextAdmin != superAdmin, "Invalid admin");
        pendingSuperAdmin = nextAdmin;
        emit SuperAdminTransferStarted(superAdmin, nextAdmin);
    }

    function acceptSuperAdmin() external {
        if (msg.sender != pendingSuperAdmin) revert UnauthorizedEvent();
        address previous = superAdmin;
        pendingSuperAdmin = address(0);
        superAdmin = msg.sender;
        _revokeRole(DEFAULT_ADMIN_ROLE, previous);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        emit SuperAdminTransferred(previous, msg.sender);
    }

    function setPanelAdmin(address wallet, bool allowed) external {
        if (msg.sender != superAdmin) revert UnauthorizedEvent();
        require(wallet != address(0) && wallet != superAdmin, "Invalid panel admin");
        if (allowed) _grantRole(PANEL_ADMIN_ROLE, wallet);
        else _revokeRole(PANEL_ADMIN_ROLE, wallet);
    }

    // Default admin stays single-holder; only the pending wallet can accept a transfer.
    function grantRole(bytes32 role, address account) public override(AccessControl, IAccessControl) {
        require(role != DEFAULT_ADMIN_ROLE, "Fixed admin");
        super.grantRole(role, account);
    }
    function revokeRole(bytes32 role, address account) public override(AccessControl, IAccessControl) {
        require(role != DEFAULT_ADMIN_ROLE, "Fixed admin");
        super.revokeRole(role, account);
    }
    function renounceRole(bytes32 role, address account) public override(AccessControl, IAccessControl) {
        require(role != DEFAULT_ADMIN_ROLE, "Fixed admin");
        super.renounceRole(role, account);
    }

    function canMint(uint256 id, address issuer) public view returns (bool) {
        return events[id].cap != 0 && eventIssuers[id][issuer];
    }

    function setEventIssuer(uint256 id, address issuer, bool allowed) external {
        _checkEventAdmin(id);
        require(issuer != address(0), "Zero issuer");
        eventIssuers[id][issuer] = allowed;
        emit EventIssuerUpdated(id, issuer, allowed);
    }

    function _checkEventAdmin(uint256 id) internal view {
        if (events[id].cap == 0) revert InvalidEvent();
        if (msg.sender != relayer && msg.sender != superAdmin) revert UnauthorizedEvent();
    }

    function createEvent(
        string calldata uri,
        uint64 cap,
        uint64 startsAt,
        uint64 endsAt,
        address organizer,
        address issuer
    ) public returns (uint256 id) {
        require(msg.sender == superAdmin || msg.sender == relayer, "Unauthorized publisher");
        if (
            organizer == address(0) || issuer == address(0) || bytes(uri).length == 0 || cap == 0 || startsAt >= endsAt
                || endsAt <= block.timestamp
        ) {
            revert InvalidEvent();
        }
        id = nextEventId++;
        events[id] = EventData(uri, cap, 0, startsAt, endsAt, false);
        eventAdmin[id] = organizer;
        eventIssuers[id][issuer] = true;
        emit EventIssuerUpdated(id, issuer, true);
        emit EventCreated(id, uri);
    }

    struct NewEvent { string uri; uint64 cap; }
    function createEvents(NewEvent[] calldata roles, uint64 startsAt, uint64 endsAt, address organizer) external {
        require(roles.length > 0 && roles.length <= 8, "Invalid roles");
        for (uint256 i; i < roles.length; ++i) {
            createEvent(roles[i].uri, roles[i].cap, startsAt, endsAt, organizer, relayer);
        }
    }

    function setEventPaused(uint256 id, bool paused) public {
        _checkEventAdmin(id);
        events[id].paused = paused;
        emit EventPauseUpdated(id, paused);
    }

    function setEventsPaused(uint256[] calldata ids, bool paused) external {
        require(ids.length > 0 && ids.length <= 8, "Invalid event group");
        for (uint256 i; i < ids.length; ++i) setEventPaused(ids[i], paused);
    }

    function mintAttendance(uint256 id, address attendee) public returns (uint256 tokenId) {
        EventData storage e = events[id];
        if (e.cap == 0) revert InvalidEvent();
        if (!canMint(id, msg.sender)) revert UnauthorizedEvent();
        if (
            e.paused || block.timestamp < e.startsAt || block.timestamp > e.endsAt || e.minted >= e.cap
                || attendee == address(0) || tokenFor[id][attendee] != 0
        ) revert NotEligible();
        tokenId = nextTokenId++;
        tokenFor[id][attendee] = tokenId;
        eventFor[tokenId] = id;
        e.minted++;
        _safeMint(attendee, tokenId);
        emit Locked(tokenId);
        emit AttendanceMinted(id, attendee, tokenId);
    }

    function mintAttendanceBatch(uint256[] calldata ids, address[] calldata wallets) external {
        require(ids.length > 0 && ids.length <= 20 && ids.length == wallets.length, "Invalid batch");
        for (uint256 i; i < ids.length; ++i) mintAttendance(ids[i], wallets[i]);
    }

    error Soulbound();
    event Locked(uint256 tokenId);

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return events[eventFor[tokenId]].uri;
    }

    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // Every ownership change, including an internal burn, passes through this hook.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to == address(0) || _ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 id) public view override(ERC721, AccessControlEnumerable) returns (bool) {
        return id == 0xb45a3c0e || super.supportsInterface(id);
    }
}
