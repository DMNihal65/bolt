import React from 'react';
import { CheckCircle, Circle, Loader2, FileCode, Terminal } from 'lucide-react';

const TaskProgress = ({ plan, results, currentTaskIndex }) => {
    if (!plan || !plan.tasks || plan.tasks.length === 0) return null;

    return (
        <div className="border border-gray-700 rounded-lg overflow-hidden bg-[#1a1a2e]">
            {/* Header */}
            <div className="px-3 py-2 bg-[#252545] border-b border-gray-700 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-200">
                    Task Progress
                </span>
                <span className="text-xs text-gray-400">
                    {results?.length || 0} / {plan.tasks.length} complete
                </span>
            </div>

            {/* Understanding */}
            {plan.understanding && (
                <div className="px-3 py-2 border-b border-gray-700 bg-blue-900/20">
                    <p className="text-xs text-blue-300">{plan.understanding}</p>
                </div>
            )}

            {/* Tasks List */}
            <div className="max-h-48 overflow-y-auto">
                {plan.tasks.map((task, index) => {
                    const result = results?.[index];
                    const isComplete = result?.success;
                    const isCurrent = index === currentTaskIndex;
                    const isPending = index > currentTaskIndex;
                    const isCommand = task.type === 'command';

                    return (
                        <div
                            key={task.id || index}
                            className={`flex items-start space-x-2 px-3 py-2 border-b border-gray-800 last:border-b-0 ${isCurrent ? 'bg-yellow-900/20' : ''
                                }`}
                        >
                            {/* Status Icon */}
                            <div className="mt-0.5">
                                {isComplete ? (
                                    <CheckCircle size={14} className="text-green-500" />
                                ) : isCurrent ? (
                                    <Loader2 size={14} className="text-yellow-400 animate-spin" />
                                ) : (
                                    <Circle size={14} className="text-gray-600" />
                                )}
                            </div>

                            {/* Task Info */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-xs ${isComplete ? 'text-gray-400' : isCurrent ? 'text-white' : 'text-gray-500'}`}>
                                    {task.description}
                                </p>
                                <div className="flex items-center space-x-2 mt-0.5">
                                    {isCommand ? (
                                        <>
                                            <Terminal size={10} className="text-purple-400" />
                                            <code className="text-[10px] text-purple-400 font-mono">{task.command}</code>
                                        </>
                                    ) : (
                                        <>
                                            <FileCode size={10} className="text-gray-600" />
                                            <code className="text-[10px] text-gray-500">{task.file}</code>
                                            <span className={`text-[10px] px-1 rounded ${task.action === 'create' ? 'bg-green-900/50 text-green-400' :
                                                task.action === 'delete' ? 'bg-red-900/50 text-red-400' :
                                                    'bg-yellow-900/50 text-yellow-400'
                                                }`}>
                                                {task.action}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Complexity Badge */}
            {plan.estimated_complexity && (
                <div className="px-3 py-1.5 bg-[#252545] border-t border-gray-700">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${plan.estimated_complexity === 'simple' ? 'bg-green-900/50 text-green-400' :
                        plan.estimated_complexity === 'complex' ? 'bg-red-900/50 text-red-400' :
                            'bg-yellow-900/50 text-yellow-400'
                        }`}>
                        {plan.estimated_complexity} complexity
                    </span>
                </div>
            )}
        </div>
    );
};

export default TaskProgress;

