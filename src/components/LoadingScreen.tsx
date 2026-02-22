interface Props {
  message: string;
}

export function LoadingScreen({ message }: Props) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="mb-6">
          <div className="inline-block w-12 h-12 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        </div>
        <h2
          className="text-2xl font-bold mb-2 text-cyan-400"
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          Loading NetrunnerDB
        </h2>
        <p className="text-gray-400">{message}</p>
      </div>
    </div>
  );
}
