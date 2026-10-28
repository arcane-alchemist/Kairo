// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Kairo} from "../contracts/Kairo.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function warp(uint256) external;
    function expectRevert() external;
}

contract BurnHarness is Kairo {
    constructor() Kairo(msg.sender, msg.sender, address(0)) {}

    function burn(uint256 id) external {
        _burn(id);
    }
}

contract KairoTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Kairo c;
    address constant STUDENT = address(0x123);

    function setUp() public {
        c = new Kairo(address(this), address(this), address(0));
        c.createEvent(
            "ipfs://metadata", 2, uint64(block.timestamp), uint64(block.timestamp + 100), address(this), address(this)
        );
    }

    function testMintMetadataAndInterfaces() public {
        uint256 id = c.mintAttendance(1, STUDENT);
        assert(c.ownerOf(id) == STUDENT && c.locked(id));
        assert(c.tokenFor(1, STUDENT) == id && c.eventFor(id) == 1);
        assert(keccak256(bytes(c.tokenURI(id))) == keccak256("ipfs://metadata"));
        assert(c.supportsInterface(0xb45a3c0e) && c.supportsInterface(0x80ac58cd));
    }

    function testAdminTransfersOnlyAfterRecipientAccepts() public {
        assert(c.hasRole(c.DEFAULT_ADMIN_ROLE(), address(this)));
        assert(!c.hasRole(c.DEFAULT_ADMIN_ROLE(), STUDENT));
        bytes32 role = c.DEFAULT_ADMIN_ROLE();
        vm.expectRevert(); c.grantRole(role, STUDENT);
        vm.expectRevert(); c.revokeRole(role, address(this));
        vm.expectRevert(); c.renounceRole(role, address(this));
        vm.expectRevert(); vm.prank(STUDENT); c.proposeSuperAdmin(STUDENT);
        vm.expectRevert(); c.proposeSuperAdmin(address(0));
        c.proposeSuperAdmin(STUDENT);
        assert(c.superAdmin() == address(this) && c.pendingSuperAdmin() == STUDENT);
        vm.expectRevert(); c.acceptSuperAdmin();
        vm.prank(STUDENT); c.acceptSuperAdmin();
        assert(c.superAdmin() == STUDENT && c.pendingSuperAdmin() == address(0));
        assert(!c.hasRole(role, address(this)) && c.hasRole(role, STUDENT));
        vm.expectRevert(); c.proposeSuperAdmin(address(0x456));
        vm.prank(STUDENT); c.setEventPaused(1, true);
        vm.expectRevert(); c.grantRole(role, address(this));
    }
    function testSuperAdminDelegatesAndRevokesPanelAccess() public {
        bytes32 panel = c.PANEL_ADMIN_ROLE();
        address another = address(0x456);
        vm.expectRevert(); vm.prank(STUDENT); c.setPanelAdmin(STUDENT, true);
        vm.expectRevert(); c.setPanelAdmin(address(0), true);
        c.setPanelAdmin(STUDENT, true);
        c.setPanelAdmin(another, true);
        assert(c.hasRole(panel, STUDENT) && c.getRoleMemberCount(panel) == 2);
        vm.expectRevert(); vm.prank(STUDENT); c.setPanelAdmin(address(0x789), true);
        vm.expectRevert(); vm.prank(STUDENT); c.createEvent("ipfs://panel",1,uint64(block.timestamp),uint64(block.timestamp+100),STUDENT,STUDENT);
        c.setPanelAdmin(STUDENT, false);
        assert(!c.hasRole(panel, STUDENT) && c.getRoleMemberCount(panel) == 1);
        assert(c.getRoleMember(panel, 0) == another);
    }
    function testRelayerPublishesWithoutAdminKey() public {
        Kairo sponsored = new Kairo(STUDENT, address(this), address(0));
        sponsored.createEvent("ipfs://role", 1, uint64(block.timestamp), uint64(block.timestamp+100), STUDENT, address(this));
        assert(!sponsored.hasRole(sponsored.DEFAULT_ADMIN_ROLE(), address(this)));
        vm.expectRevert(); vm.prank(STUDENT);
        sponsored.createEvent("", 1, 1, 2, STUDENT, address(this));
    }

    function testReplacementPreservesIds() public {
        c.mintAttendance(1, STUDENT);
        Kairo replacement = new Kairo(STUDENT, address(this), address(c));
        assert(replacement.nextEventId() == c.nextEventId());
        assert(replacement.nextTokenId() == c.nextTokenId());
    }
    function testBatchPublishesRolesAndMints() public {
        Kairo.NewEvent[] memory roles = new Kairo.NewEvent[](2);
        roles[0] = Kairo.NewEvent("ipfs://attendee", 3);
        roles[1] = Kairo.NewEvent("ipfs://judge", 1);
        c.createEvents(roles, uint64(block.timestamp), uint64(block.timestamp+100), STUDENT);
        uint256[] memory ids = new uint256[](2);
        address[] memory wallets = new address[](2);
        ids[0] = 2; ids[1] = 3; wallets[0] = STUDENT; wallets[1] = STUDENT;
        c.mintAttendanceBatch(ids, wallets);
        assert(c.tokenFor(2, STUDENT) != c.tokenFor(3, STUDENT));
        vm.expectRevert(); c.mintAttendanceBatch(ids, wallets);
    }

    function testUnauthorized() public {
        vm.expectRevert();
        vm.prank(STUDENT);
        c.mintAttendance(1, STUDENT);
        vm.expectRevert();
        vm.prank(STUDENT);
        c.createEvent("x", 1, 1, 100, STUDENT, STUDENT);
        vm.expectRevert();
        vm.prank(STUDENT);
        c.setEventPaused(1, true);
    }

    function testEventPermissionsAndMetadataAreIsolated() public {
        address organizer = address(0x456);
        address issuer = address(0x789);
        uint256 second = c.createEvent(
            "ipfs://second", 2, uint64(block.timestamp), uint64(block.timestamp + 100), organizer, issuer
        );
        assert(c.canMint(second, issuer) && !c.canMint(1, issuer));
        vm.expectRevert();
        vm.prank(issuer);
        c.mintAttendance(1, STUDENT);
        vm.expectRevert();
        c.mintAttendance(second, STUDENT);
        vm.prank(issuer);
        uint256 secondToken = c.mintAttendance(second, STUDENT);
        uint256 firstToken = c.mintAttendance(1, STUDENT);
        assert(secondToken != firstToken);
        assert(c.eventFor(secondToken) == second);
        assert(keccak256(bytes(c.tokenURI(secondToken))) == keccak256("ipfs://second"));
        assert(keccak256(bytes(c.tokenURI(firstToken))) == keccak256("ipfs://metadata"));
        vm.expectRevert();
        vm.prank(organizer);
        c.setEventPaused(1, true);
        vm.expectRevert();
        vm.prank(issuer);
        c.setEventIssuer(second, STUDENT, true);
        c.setEventIssuer(second, issuer, false);
        vm.expectRevert();
        vm.prank(issuer);
        c.mintAttendance(second, address(2));
        c.setEventIssuer(second, STUDENT, true);
        c.setEventPaused(second, true);
        vm.expectRevert();
        vm.prank(STUDENT);
        c.mintAttendance(second, address(2));
        c.setEventPaused(second, false);
        vm.prank(STUDENT);
        c.mintAttendance(second, address(2));
    }

    function testRejectedReceiverRollsBackMint() public {
        vm.expectRevert();
        c.mintAttendance(1, address(this));
        assert(c.tokenFor(1, address(this)) == 0 && c.nextTokenId() == 1);
        (,, uint64 minted,,,) = c.events(1);
        assert(minted == 0);
        assert(c.mintAttendance(1, STUDENT) == 1);
    }

    function testInvalidAuthorities() public {
        vm.expectRevert();
        new Kairo(address(0), address(this), address(0));
        vm.expectRevert();
        c.createEvent("x", 1, uint64(block.timestamp), uint64(block.timestamp + 1), address(0), STUDENT);
        vm.expectRevert();
        c.setEventIssuer(1, address(0), true);
        vm.expectRevert();
        c.setEventIssuer(99, STUDENT, true);
    }

    function testDuplicateCapAndZeroAddress() public {
        c.mintAttendance(1, STUDENT);
        vm.expectRevert();
        c.mintAttendance(1, STUDENT);
        vm.expectRevert();
        c.mintAttendance(1, address(0));
        c.mintAttendance(1, address(2));
        vm.expectRevert();
        c.mintAttendance(1, address(3));
    }

    function testAllTransfersAndApprovalsFail() public {
        uint256 id = c.mintAttendance(1, STUDENT);
        vm.startPrank(STUDENT);
        vm.expectRevert();
        c.transferFrom(STUDENT, address(2), id);
        vm.expectRevert();
        c.safeTransferFrom(STUDENT, address(2), id);
        vm.expectRevert();
        c.safeTransferFrom(STUDENT, address(2), id, "");
        vm.expectRevert();
        c.transferFrom(STUDENT, address(0), id);
        vm.expectRevert();
        c.approve(address(2), id);
        vm.expectRevert();
        c.setApprovalForAll(address(2), true);
        vm.stopPrank();
        assert(c.ownerOf(id) == STUDENT);
    }

    function testEvenInternalBurnFails() public {
        BurnHarness h = new BurnHarness();
        h.createEvent(
            "ipfs://x", 1, uint64(block.timestamp), uint64(block.timestamp + 100), address(this), address(this)
        );
        uint256 id = h.mintAttendance(1, STUDENT);
        vm.expectRevert();
        h.burn(id);
        assert(h.ownerOf(id) == STUDENT);
    }

    function testWindowPauseAndInvalidEvent() public {
        vm.expectRevert();
        c.mintAttendance(99, STUDENT);
        c.setEventPaused(1, true);
        vm.expectRevert();
        c.mintAttendance(1, STUDENT);
        c.setEventPaused(1, false);
        vm.warp(block.timestamp + 101);
        vm.expectRevert();
        c.mintAttendance(1, STUDENT);
        uint256 id = c.createEvent(
            "x", 1, uint64(block.timestamp + 10), uint64(block.timestamp + 20), address(this), address(this)
        );
        vm.expectRevert();
        c.mintAttendance(id, STUDENT);
        vm.expectRevert();
        c.createEvent("", 1, 1, 2, address(this), address(this));
        vm.expectRevert();
        c.locked(999);
    }

    function testOrganizerCannotGrantMintingOrModerateOwnEvent() public {
        address organizer = address(0x456);
        Kairo sponsored = new Kairo(STUDENT, address(this), address(0));
        sponsored.createEvent("ipfs://role", 2, uint64(block.timestamp), uint64(block.timestamp + 100), organizer, address(this));
        assert(sponsored.eventAdmin(1) == organizer);
        assert(!sponsored.hasRole(sponsored.DEFAULT_ADMIN_ROLE(), address(this)));
        assert(!sponsored.hasRole(sponsored.DEFAULT_ADMIN_ROLE(), organizer));
        vm.startPrank(organizer);
        vm.expectRevert(); sponsored.setEventPaused(1, true);
        vm.expectRevert(); sponsored.setEventIssuer(1, organizer, true);
        vm.expectRevert(); sponsored.mintAttendance(1, organizer);
        vm.stopPrank();
        sponsored.setEventPaused(1, true);
        vm.prank(STUDENT);
        sponsored.setEventPaused(1, false);
        assert(sponsored.mintAttendance(1, organizer) != 0);
    }

    function testInvalidRolePublicationRollsBackEveryRole() public {
        Kairo.NewEvent[] memory roles = new Kairo.NewEvent[](2);
        roles[0] = Kairo.NewEvent("ipfs://valid", 2);
        roles[1] = Kairo.NewEvent("ipfs://invalid", 0);
        vm.expectRevert(); c.createEvents(roles, uint64(block.timestamp), uint64(block.timestamp + 100), STUDENT);
        assert(c.nextEventId() == 2);
        (, uint64 cap,,,,) = c.events(2);
        assert(cap == 0 && c.eventAdmin(2) == address(0));
    }

    function testRoleLimitAndAtomicGroupModeration() public {
        Kairo.NewEvent[] memory roles = new Kairo.NewEvent[](9);
        vm.expectRevert(); c.createEvents(roles, uint64(block.timestamp), uint64(block.timestamp + 100), STUDENT);
        roles = new Kairo.NewEvent[](0);
        vm.expectRevert(); c.createEvents(roles, uint64(block.timestamp), uint64(block.timestamp + 100), STUDENT);
        roles = new Kairo.NewEvent[](8);
        for (uint256 i; i < roles.length; ++i) roles[i] = Kairo.NewEvent("ipfs://role", 1);
        c.createEvents(roles, uint64(block.timestamp), uint64(block.timestamp + 100), STUDENT);
        uint256[] memory ids = new uint256[](8);
        for (uint256 i; i < ids.length; ++i) ids[i] = i + 2;
        c.setEventsPaused(ids, true);
        for (uint256 i; i < ids.length; ++i) {
            (,,,,, bool paused) = c.events(ids[i]);
            assert(paused);
        }
        ids[7] = 999;
        vm.expectRevert(); c.setEventsPaused(ids, false);
        (,,,,, bool stillPaused) = c.events(2);
        assert(stillPaused);
    }

    function testTwentySponsoredMintsAndBatchRollback() public {
        uint256 id = c.createEvent("ipfs://batch", 20, uint64(block.timestamp), uint64(block.timestamp + 100), STUDENT, address(this));
        uint256[] memory ids = new uint256[](21);
        address[] memory wallets = new address[](21);
        for (uint256 i; i < ids.length; ++i) { ids[i] = id; wallets[i] = address(uint160(0x1000 + i)); }
        vm.expectRevert(); c.mintAttendanceBatch(ids, wallets);
        ids = new uint256[](20); wallets = new address[](20);
        for (uint256 i; i < ids.length; ++i) { ids[i] = id; wallets[i] = address(uint160(0x1000 + i)); }
        wallets[19] = wallets[0];
        vm.expectRevert(); c.mintAttendanceBatch(ids, wallets);
        assert(c.nextTokenId() == 1 && c.tokenFor(id, wallets[0]) == 0);
        wallets[19] = address(0x1013);
        c.mintAttendanceBatch(ids, wallets);
        (,, uint64 minted,,,) = c.events(id);
        assert(minted == 20);
        for (uint256 i; i < wallets.length; ++i) assert(c.ownerOf(c.tokenFor(id, wallets[i])) == wallets[i]);
    }

    function testModerationLeavesArtworkCapAndWindowFrozen() public {
        (string memory uri, uint64 cap,, uint64 startsAt, uint64 endsAt,) = c.events(1);
        c.setEventPaused(1, true);
        c.setEventIssuer(1, STUDENT, true);
        c.setEventPaused(1, false);
        uint256 tokenId = c.mintAttendance(1, STUDENT);
        (string memory finalURI, uint64 finalCap,, uint64 finalStart, uint64 finalEnd,) = c.events(1);
        assert(keccak256(bytes(uri)) == keccak256(bytes(finalURI)));
        assert(keccak256(bytes(c.tokenURI(tokenId))) == keccak256(bytes(uri)));
        assert(cap == finalCap && startsAt == finalStart && endsAt == finalEnd);
    }

}
