import React from 'react';
import { RefreshCw } from 'lucide-react';

const Preview = ({ url, isBooting, bootMessage }) => {
    return (
        <div className="h-full flex flex-col bg-[#252526]">
            {/* Address Bar */}
            <div className="h-10 bg-[#3c3c3c] border-b border-gray-700 flex items-center px-3 space-x-2">
                <button
                    className="p-1 hover:bg-gray-600 rounded"
                    onClick={() => {
                        const iframe = document.getElementById('preview-iframe');
                        if (iframe && url) iframe.src = url;
                    }}
                >
                    <RefreshCw size={14} className="text-gray-400" />
                </button>
                <div className="flex-1 bg-[#1e1e1e] border border-gray-600 rounded px-3 py-1 text-sm text-gray-400 truncate">
                    {url || 'No preview available'}
                </div>
            </div>

            {/* Preview Content */}
            <div className="flex-1 relative bg-white">
                {isBooting || !url ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] text-gray-400">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-4"></div>
                        <p className="text-sm">{bootMessage || 'Waiting for server...'}</p>
                    </div>
                ) : (
                    <iframe
                        id="preview-iframe"
                        src={url}
                        className="w-full h-full border-none"
                        title="Preview"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    />
                )}
            </div>
        </div>
    );
};

export default Preview;
