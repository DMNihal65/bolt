import React, { useState } from 'react';
import { HelpCircle, Send, Check, X } from 'lucide-react';

const ClarifyQuestion = ({ question, understanding, onSubmit, onSkip }) => {
    const [response, setResponse] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!response.trim()) return;
        setIsSubmitting(true);
        await onSubmit(response);
        setIsSubmitting(false);
    };

    // Common quick responses based on question type
    const quickResponses = [
        'Keep it simple',
        'Make it professional',
        'Add more features',
        'Just the basics',
    ];

    return (
        <div className="border border-blue-700/50 rounded-lg overflow-hidden bg-blue-900/20">
            {/* Header */}
            <div className="px-3 py-2 bg-blue-900/30 border-b border-blue-700/50 flex items-center space-x-2">
                <HelpCircle size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-blue-300">Clarification Needed</span>
            </div>

            {/* Understanding */}
            {understanding && (
                <div className="px-3 py-2 bg-blue-900/10 border-b border-blue-700/30">
                    <p className="text-xs text-gray-400">
                        <span className="text-gray-500">I understood:</span> {understanding}
                    </p>
                </div>
            )}

            {/* Question */}
            <div className="p-3">
                <p className="text-sm text-blue-200 mb-3">{question}</p>

                {/* Quick Responses */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {quickResponses.map((qr) => (
                        <button
                            key={qr}
                            onClick={() => setResponse(qr)}
                            className="text-xs px-2 py-1 rounded bg-blue-800/50 text-blue-300 hover:bg-blue-700/50"
                        >
                            {qr}
                        </button>
                    ))}
                </div>

                {/* Custom Response Input */}
                <div className="relative">
                    <input
                        type="text"
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                        placeholder="Type your response..."
                        disabled={isSubmitting}
                        className="w-full bg-[#1e1e2e] text-white rounded-lg pl-3 pr-20 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                        <button
                            onClick={onSkip}
                            className="p-1.5 text-gray-500 hover:text-red-400"
                            title="Skip clarification"
                        >
                            <X size={14} />
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting || !response.trim()}
                            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <span className="animate-spin">⏳</span>
                            ) : (
                                <Send size={14} />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClarifyQuestion;
