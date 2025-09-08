// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Simple Football Prediction Market (A vs B vs Draw) — Monad Testnet
/// @notice Pari-mutuel: all stakes go into three pools; winners claim pro-rata
contract PredictionMarketSimple {
    struct Market {
        string teamA;
        string teamB;
        uint64 cutoff;        // timestamp after which no new bets
        uint16 feeBps;        // protocol fee in basis points (e.g., 100 = 1%)
        bool resolved;
        uint8 winner;         // 1 = A, 2 = B, 3 = Draw
        string score;         // e.g. "2-1"
        uint256 poolA;
        uint256 poolB;
        uint256 poolDraw;
        mapping(address => uint256) betA;
        mapping(address => uint256) betB;
        mapping(address => uint256) betD;
        mapping(address => bool) claimed;
    }

    event MarketCreated(uint256 indexed id, string teamA, string teamB, uint64 cutoff, uint16 feeBps);
    event BetPlaced(uint256 indexed id, address indexed bettor, uint8 side, uint256 amount);
    event MarketResolved(uint256 indexed id, uint8 winner, string score);
    event Claimed(uint256 indexed id, address indexed user, uint256 amount, uint256 fee);

    address public owner;
    uint256 public marketCount;
    mapping(uint256 => Market) private markets;
    uint256 public feesAccrued;

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier existing(uint256 id){ require(id < marketCount, "bad id"); _; }

    constructor(){ owner = msg.sender; }

    function createMarket(
        string calldata teamA,
        string calldata teamB,
        uint64 cutoff,
        uint16 feeBps
    ) external onlyOwner returns (uint256 id) {
        require(feeBps <= 1000, "fee too high"); // max 10%
        id = marketCount++;
        Market storage m = markets[id];
        m.teamA = teamA; m.teamB = teamB; m.cutoff = cutoff; m.feeBps = feeBps;
        emit MarketCreated(id, teamA, teamB, cutoff, feeBps);
    }

    /// @param side 1 = A, 2 = B, 3 = Draw
    function bet(uint256 id, uint8 side) external payable existing(id) {
        Market storage m = markets[id];
        require(block.timestamp < m.cutoff, "betting closed");
        require(msg.value > 0, "no value");
        if (side == 1) { m.poolA += msg.value; m.betA[msg.sender] += msg.value; }
        else if (side == 2) { m.poolB += msg.value; m.betB[msg.sender] += msg.value; }
        else if (side == 3) { m.poolDraw += msg.value; m.betD[msg.sender] += msg.value; }
        else revert("bad side");
        emit BetPlaced(id, msg.sender, side, msg.value);
    }

    function resolve(uint256 id, uint8 winner, string calldata score) external onlyOwner existing(id) {
        Market storage m = markets[id];
        require(!m.resolved, "already");
        require(winner == 1 || winner == 2 || winner == 3, "bad winner");
        m.resolved = true; m.winner = winner; m.score = score;
        emit MarketResolved(id, winner, score);
    }

    function claim(uint256 id) external existing(id) {
        Market storage m = markets[id];
        require(m.resolved, "not resolved");
        require(!m.claimed[msg.sender], "claimed");

        uint256 userStake;
        uint256 winPool;
        if (m.winner == 1) { userStake = m.betA[msg.sender]; winPool = m.poolA; }
        else if (m.winner == 2) { userStake = m.betB[msg.sender]; winPool = m.poolB; }
        else { userStake = m.betD[msg.sender]; winPool = m.poolDraw; }

        require(userStake > 0, "no winnings");

        uint256 totalPool = m.poolA + m.poolB + m.poolDraw;
        uint256 gross = (totalPool * userStake) / winPool;
        uint256 fee = (gross * m.feeBps) / 10_000;
        m.claimed[msg.sender] = true;

        (bool ok,) = msg.sender.call{value: gross - fee}("");
        require(ok, "transfer failed");

        feesAccrued += fee;
        emit Claimed(id, msg.sender, gross - fee, fee);
    }

    function withdrawFees(address payable to) external onlyOwner {
        uint256 amt = feesAccrued; feesAccrued = 0;
        (bool ok,) = to.call{value: amt}(""); require(ok, "fee transfer failed");
    }

    function getMarket(uint256 id) external view existing(id)
      returns (string memory, string memory, uint64, uint16, bool, uint8, string memory, uint256, uint256, uint256)
    {
        Market storage m = markets[id];
        return (m.teamA, m.teamB, m.cutoff, m.feeBps, m.resolved, m.winner, m.score, m.poolA, m.poolB, m.poolDraw);
    }
}
