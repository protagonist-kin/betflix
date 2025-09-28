import React from "react";
import { useAccount } from "wagmi";
import { ArrowTopRightOnSquareIcon, TrophyIcon } from "@heroicons/react/24/outline";
import { useSubgraphQuery } from "~~/hooks/useSubgraphQuery";

const GET_USER_ENS_TROPHIES = `
  query GetUserENSTrophies($userAddress: String!) {
    user(id: $userAddress) {
      id
      betsWon {
        id
        ensSubdomain
        amount
        targetPrice
        priceExponent
        priceFeedId
        startPrice
        deadline
      }
    }
  }
`;

export const ENSTrophies: React.FC = () => {
  const { address } = useAccount();

  const { data, loading } = useSubgraphQuery(GET_USER_ENS_TROPHIES, {
    variables: {
      userAddress: address?.toLowerCase() || "",
    },
    skip: !address,
  });

  const wonBets = data?.user?.betsWon || [];

  if (!address || wonBets.length === 0) {
    return null;
  }

  const getENSUrl = (subdomain: string) => {
    return `https://app.ens.domains/betflix.eth/${subdomain}`;
  };

  return (
    <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4 my-4">
      <div className="flex items-center gap-2 mb-3">
        <TrophyIcon className="h-6 w-6 text-yellow-500" />
        <h3 className="text-lg font-bold">Your ENS Trophies</h3>
        <span className="text-sm text-gray-500">({wonBets.length} won)</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {wonBets.map((bet: any, index: number) => (
          <div
            key={bet.id}
            className="relative group"
            style={{
              animation: `fadeInScale 0.3s ease-out ${index * 0.1}s both`,
            }}
          >
            <div className="bg-white rounded-lg shadow-md p-4 border-2 border-purple-200 hover:border-purple-400 transition-all duration-200 hover:shadow-lg hover:scale-105">
              <div className="absolute -top-2 -right-2 bg-yellow-400 rounded-full p-2 animate-pulse">
                <TrophyIcon className="h-4 w-4 text-white" />
              </div>

              <div className="font-mono text-sm font-bold text-purple-600 mb-2">{bet.ensSubdomain}.betflix.eth</div>

              <div className="text-xs text-gray-500 mb-3">Won: {(Number(bet.amount) / 1e18).toFixed(4)} ETH</div>

              <div className="flex gap-2">
                <a
                  href={getENSUrl(bet.ensSubdomain)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-purple-100 hover:bg-purple-200 px-2 py-1 rounded transition-colors"
                >
                  View ENS
                  <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
