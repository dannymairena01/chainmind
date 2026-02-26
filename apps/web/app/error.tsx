"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error("Runtime Exception Caught by Error Boundary:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-black/95 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                    <AlertCircle className="w-10 h-10 text-red-500" />
                </div>

                <div className="space-y-3">
                    <h1 className="text-3xl font-display font-medium text-white">Something went wrong</h1>
                    <p className="text-zinc-400 text-lg max-w-sm mx-auto">
                        An unexpected error occurred while rendering this page or communicating with the blockchain.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <button
                        onClick={reset}
                        className="w-full sm:w-auto px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-zinc-200 transition-colors focus:ring-2 focus:ring-white/20 outline-none"
                    >
                        Try again
                    </button>
                    <Link
                        href="/"
                        className="w-full sm:w-auto px-6 py-3 bg-zinc-900 border border-zinc-800 text-white rounded-lg font-medium hover:bg-zinc-800 transition-colors focus:ring-2 focus:ring-white/10 outline-none"
                    >
                        Return Home
                    </Link>
                </div>
            </div>
        </div>
    );
}
