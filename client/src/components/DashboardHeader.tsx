import { ConnectButton } from '@rainbow-me/rainbowkit';

export function DashboardHeader() {
    return (
        <header className="w-full max-w-4xl flex justify-between items-center p-4 border-b border-gray-700">
            <h1 className="text-xl md:text-2xl font-bold">⚡️ Forge Dashboard</h1>
            <ConnectButton />
        </header>
    );
}
