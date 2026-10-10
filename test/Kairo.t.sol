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
    constructor() Kairo(msg.sender) {}

    function burn(uint256 id) external {
        _burn(id);
    }
}

contract KairoTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    Kairo c;
    address constant STUDENT = address(0x123);

    function setUp() public {
        c = new Kairo(address(this));
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
        vm.prank(organizer);
        c.setEventIssuer(second, issuer, false);
        vm.expectRevert();
        vm.prank(issuer);
        c.mintAttendance(second, address(2));
        vm.prank(organizer);
        c.setEventIssuer(second, STUDENT, true);
        vm.prank(organizer);
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
        new Kairo(address(0));
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
}
