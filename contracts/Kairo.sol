// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Event configuration and staff-authorized attendance distribution.
contract Kairo is ERC721, AccessControl {
    uint256 public nextTokenId = 1;
    mapping(uint256 => uint256) public eventFor;
    mapping(uint256 => address) public eventAdmin;
    mapping(uint256 => mapping(address => bool)) public eventIssuers;
    error UnauthorizedEvent();
    event EventIssuerUpdated(uint256 indexed eventId, address indexed issuer, bool allowed);

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

    constructor(address admin) ERC721("Kairo Attendance", "KAIRO") {
        require(admin != address(0), "Zero authority");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
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
        if (msg.sender != eventAdmin[id] && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert UnauthorizedEvent();
    }

    function createEvent(
        string calldata uri,
        uint64 cap,
        uint64 startsAt,
        uint64 endsAt,
        address organizer,
        address issuer
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 id) {
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

    function setEventPaused(uint256 id, bool paused) external {
        _checkEventAdmin(id);
        events[id].paused = paused;
    }

    function mintAttendance(uint256 id, address attendee) external returns (uint256 tokenId) {
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

    function supportsInterface(bytes4 id) public view override(ERC721, AccessControl) returns (bool) {
        return id == 0xb45a3c0e || super.supportsInterface(id);
    }
}
