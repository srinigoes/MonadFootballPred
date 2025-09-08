"use client";

import { useEffect, useState } from "react";
import { type Address, formatEther, parseEther } from "viem";
import { useAccount, useBalance, useReadContract, useSwitchChain, useWriteContract } from "wagmi";

// Chain config (Monad Testnet)
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);

// Minimal ABI for the functions we call
const ABI = [
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "teamA", type: "string" },
      { name: "teamB", type: "string" },
      { name: "cutoff", type: "uint64" },
      { name: "feeBps", type: "uint16" },
    ],
    outputs: [{ name: "id", type: "uint256" }],
  },
  {
    type: "function",
    name: "bet",
    stateMutability: "payable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "side", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "winner", type: "uint8" },
      { name: "score", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { type: "string" }, // teamA
      { type: "string" }, // teamB
      { type: "uint64" }, // cutoff
      { type: "uint16" }, // feeBps
      { type: "bool" }, // resolved
      { type: "uint8" }, // winner
      { type: "string" }, // score
      { type: "uint256" }, // poolA
      { type: "uint256" }, // poolB
      { type: "uint256" }, // poolDraw
    ],
  },
  {
    type: "function",
    name: "marketCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

// Your deployed contract on Monad Testnet
const CONTRACT: Address = "0x213556bbFD988d401ee07eA2760736D1CEFDf306";

// Optional: a tuple type for getMarket() to keep TS happy
type MarketTuple = [
  string, // teamA
  string, // teamB
  bigint, // cutoff (uint64)
  number, // feeBps (uint16) - displayed as number
  boolean, // resolved
  number, // winner (uint8)
  string, // score
  bigint, // poolA
  bigint, // poolB
  bigint, // poolDraw
];

export default function MarketPage() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, chainId: CHAIN_ID });
  const { writeContract, isPending } = useWriteContract();

  // form state
  const [teamA, setTeamA] = useState("India");
  const [teamB, setTeamB] = useState("Brazil");
  const [cutoff, setCutoff] = useState<number>(() => Math.floor(Date.now() / 1000) + 3600);
  const [feeBps, setFeeBps] = useState<number>(100);

  const [marketId, setMarketId] = useState<number>(0);
  const [betSide, setBetSide] = useState<1 | 2 | 3>(1);
  const [betAmt, setBetAmt] = useState<string>("0.1");

  const [winner, setWinner] = useState<1 | 2 | 3>(1);
  const [score, setScore] = useState<string>("2-1");

  // reads
  const { data: count } = useReadContract({
    address: CONTRACT,
    abi: ABI,
    functionName: "marketCount",
    chainId: CHAIN_ID,
  });

  const { data: owner } = useReadContract({
    address: CONTRACT,
    abi: ABI,
    functionName: "owner",
    chainId: CHAIN_ID,
  });

  const isOwner = (owner as Address | undefined)?.toLowerCase() === address?.toLowerCase();

  const { data: market } = useReadContract({
    address: CONTRACT,
    abi: ABI,
    functionName: "getMarket",
    args: [BigInt(marketId || 0)],
    chainId: CHAIN_ID,
  });

  // auto-switch to Monad Testnet
  useEffect(() => {
    if (isConnected && chainId !== CHAIN_ID && switchChain) {
      switchChain({ chainId: CHAIN_ID });
    }
  }, [isConnected, chainId, switchChain]);

  return (
    <div className="max-w-5xl mx-auto p-6 grid gap-6">
      <h1 className="text-2xl font-semibold">Football Prediction Market — Monad Testnet</h1>

      {/* Wallet / Basics */}
      <div className="grid gap-2 text-sm opacity-80">
        <div>Connected: {address ?? "—"}</div>
        <div>Balance: {bal ? `${Number(bal.formatted).toFixed(4)} MON` : "—"}</div>
        <div>
          Contract: <span className="font-mono">{CONTRACT}</span>
        </div>
        <div>Total Markets: {count?.toString() ?? "—"}</div>
        <div>
          Owner: <span className="font-mono">{(owner as string) ?? "—"}</span> {isOwner ? "(you)" : ""}
        </div>
      </div>

      {/* Create */}
      <div className="rounded-2xl shadow p-4 border">
        <h2 className="font-medium mb-3">Create Match {isOwner ? "" : "(owner only)"}</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <input
            className="input input-bordered"
            placeholder="Team A"
            value={teamA}
            onChange={e => setTeamA(e.target.value)}
          />
          <input
            className="input input-bordered"
            placeholder="Team B"
            value={teamB}
            onChange={e => setTeamB(e.target.value)}
          />
          <input
            className="input input-bordered"
            placeholder="Cutoff (UNIX seconds)"
            value={cutoff}
            onChange={e => setCutoff(Number(e.target.value || 0))}
          />
          <input
            className="input input-bordered"
            placeholder="Fee bps (100 = 1%)"
            value={feeBps}
            onChange={e => setFeeBps(Number(e.target.value || 0))}
          />
        </div>
        <button
          className="btn btn-primary mt-3"
          disabled={!isOwner || isPending}
          onClick={async () => {
            await writeContract({
              address: CONTRACT,
              abi: ABI,
              functionName: "createMarket",
              args: [teamA, teamB, BigInt(cutoff), Number(feeBps)],
            });
          }}
        >
          Create
        </button>
      </div>

      {/* Bet */}
      <div className="rounded-2xl shadow p-4 border">
        <h2 className="font-medium mb-3">Bet</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="input input-bordered"
            placeholder="Market id"
            value={marketId}
            onChange={e => setMarketId(Number(e.target.value || 0))}
          />
          <select
            className="select select-bordered"
            value={betSide}
            onChange={e => setBetSide(Number(e.target.value) as 1 | 2 | 3)}
          >
            <option value={1}>Team A</option>
            <option value={2}>Team B</option>
            <option value={3}>Draw</option>
          </select>
          <input
            className="input input-bordered"
            placeholder="Amount MON (e.g. 0.1)"
            value={betAmt}
            onChange={e => setBetAmt(e.target.value)}
          />
        </div>
        <button
          className="btn btn-success mt-3"
          disabled={!isConnected || isPending}
          onClick={async () => {
            await writeContract({
              address: CONTRACT,
              abi: ABI,
              functionName: "bet",
              args: [BigInt(marketId || 0), betSide],
              value: parseEther(betAmt || "0"),
            });
          }}
        >
          Place Bet
        </button>
      </div>

      {/* Resolve + Claim */}
      <div className="rounded-2xl shadow p-4 border">
        <h2 className="font-medium mb-3">Resolve & Claim</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="input input-bordered"
            placeholder="Market id"
            value={marketId}
            onChange={e => setMarketId(Number(e.target.value || 0))}
          />
          <select
            className="select select-bordered"
            value={winner}
            onChange={e => setWinner(Number(e.target.value) as 1 | 2 | 3)}
          >
            <option value={1}>Winner: Team A</option>
            <option value={2}>Winner: Team B</option>
            <option value={3}>Winner: Draw</option>
          </select>
          <input
            className="input input-bordered"
            placeholder='Score (e.g. "2-1")'
            value={score}
            onChange={e => setScore(e.target.value)}
          />
        </div>
        <div className="flex gap-2 mt-3">
          <button
            className="btn btn-warning"
            disabled={!isOwner || isPending}
            onClick={async () => {
              await writeContract({
                address: CONTRACT,
                abi: ABI,
                functionName: "resolve",
                args: [BigInt(marketId || 0), winner, score],
              });
            }}
          >
            Resolve (owner)
          </button>

          <button
            className="btn btn-outline"
            disabled={!isConnected || isPending}
            onClick={async () => {
              await writeContract({
                address: CONTRACT,
                abi: ABI,
                functionName: "claim",
                args: [BigInt(marketId || 0)],
              });
            }}
          >
            Claim
          </button>
        </div>
      </div>

      {/* Market snapshot */}
      <div className="rounded-2xl shadow p-4 border">
        <h2 className="font-medium mb-3">Market #{marketId} snapshot</h2>
        <pre className="whitespace-pre-wrap opacity-80 text-sm">
          {(() => {
            if (!market) return "Enter a market id to preview";

            // Teach TS the tuple structure so indexing is safe
            const [
              teamAOut,
              teamBOut,
              cutoffOut,
              feeBpsOut,
              resolvedOut,
              winnerOut,
              scoreOut,
              poolAOut,
              poolBOut,
              poolDrawOut,
            ] = market as unknown as MarketTuple;

            return JSON.stringify(
              {
                teamA: teamAOut,
                teamB: teamBOut,
                cutoff: Number(cutoffOut),
                feeBps: Number(feeBpsOut),
                resolved: resolvedOut,
                winner: Number(winnerOut),
                score: scoreOut,
                poolA: formatEther(poolAOut),
                poolB: formatEther(poolBOut),
                poolDraw: formatEther(poolDrawOut),
              },
              null,
              2,
            );
          })()}
        </pre>
      </div>
    </div>
  );
}
