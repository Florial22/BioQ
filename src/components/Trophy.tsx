type Rank = 1|2|3;
export function Trophy({ rank, className = "w-5 h-5" }: { rank: Rank; className?: string }) {
  const src = rank === 1
    ? "/badges/first.svg"
    : rank === 2
    ? "/badges/second.svg"
    : "/badges/third.svg";
  const alt = rank === 1 ? "Winner" : rank === 2 ? "Second place" : "Third place";
  return <img src={src} alt={alt} className={className} />;
}
