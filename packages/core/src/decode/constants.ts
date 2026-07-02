import { toFunctionSelector, type Hex } from "viem";
import { CONTAINER_SIGNATURES } from "./containers";

/**
 * Solidity Panic(uint256) codes — clean-room from the Solidity docs
 * (https://docs.soliditylang.org/en/latest/control-structures.html#panic-via-assert-and-error-via-require)
 */
export const PANIC_CODES: Record<number, string> = {
  0x00: "generic compiler-inserted panic",
  0x01: "assert(false) — assertion failed",
  0x11: "arithmetic overflow or underflow outside unchecked { }",
  0x12: "division or modulo by zero",
  0x21: "value out of range converted to enum",
  0x22: "incorrectly encoded storage byte array accessed",
  0x31: ".pop() called on an empty array",
  0x32: "array index out of bounds",
  0x41: "too much memory allocated or array too large",
  0x51: "zero-initialized internal function variable called",
};

/**
 * Built-in signatures so the most frequent calls decode with zero network
 * lookups (PLAN §5.4). Selectors are computed, not hardcoded — a typo here
 * becomes a wrong key, never a wrong mapping.
 */
const COMMON_FUNCTION_SIGNATURES = [
  // ERC-20
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
  // ERC-721
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getApproved(uint256 tokenId) view returns (address)",
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function mint(address to, uint256 amount)",
  "function burn(uint256 amount)",
  // ERC-1155
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
  "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] amounts, bytes data)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])",
  "function uri(uint256 id) view returns (string)",
  // Ownable / Pausable / access control
  "function owner() view returns (address)",
  "function transferOwnership(address newOwner)",
  "function renounceOwnership()",
  "function pause()",
  "function unpause()",
  "function paused() view returns (bool)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function grantRole(bytes32 role, address account)",
  // WETH
  "function deposit() payable",
  "function withdraw(uint256 amount)",
] as const;

export const COMMON_SELECTORS: ReadonlyMap<Hex, string> = new Map(
  [...COMMON_FUNCTION_SIGNATURES, ...CONTAINER_SIGNATURES].map((sig) => [
    toFunctionSelector(sig),
    sig,
  ]),
);

/**
 * Frequent revert signatures: OpenZeppelin v5 ERC-6093 errors,
 * Ownable/Pausable v5 errors, and ubiquitous DeFi errors.
 */
const COMMON_ERROR_SIGNATURES = [
  // OZ v5 ERC-20 (ERC-6093)
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20InvalidApprover(address approver)",
  "error ERC20InvalidSpender(address spender)",
  // OZ v5 ERC-721
  "error ERC721NonexistentToken(uint256 tokenId)",
  "error ERC721InsufficientApproval(address operator, uint256 tokenId)",
  "error ERC721InvalidOwner(address owner)",
  "error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner)",
  // OZ v5 access/pause
  "error OwnableUnauthorizedAccount(address account)",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
  "error EnforcedPause()",
  "error ExpectedPause()",
  // misc common
  "error InsufficientBalance()",
  "error Unauthorized()",
  "error InvalidSignature()",
  "error DeadlineExpired()",
] as const;

export { COMMON_ERROR_SIGNATURES };
