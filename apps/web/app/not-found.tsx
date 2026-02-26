import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="w-24 h-24 bg-zinc-900/50 rounded-full flex items-center justify-center mx-auto border border-zinc-800/50">
                    <FileQuestion className="w-12 h-12 text-zinc-500" />
                </div>

                <div className="space-y-3">
                    <h1 className="text-4xl font-display font-semibold text-white tracking-tight">404</h1>
                    <p className="text-zinc-400 text-lg">
                        The page or agent you're looking for doesn't exist or has been deleted.
                    </p>
                </div>

                <div className="pt-6">
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center justify-center px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 transition-colors focus:ring-2 focus:ring-white/20 outline-none shadow-[0_0_15px_rgba(255,255,255,0.1)]"
                    >
                        Head back to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
}
