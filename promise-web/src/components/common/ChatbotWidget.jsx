import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Bot, User, ChevronUp } from 'lucide-react';
import { getChatbotResponse, getFAQCategories, getIntentResponse } from '../../utils/chatbotLogic';

export default function ChatbotWidget({ user, onOpenDirectMessage }) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef(null);

    // Initial Greeting and Options
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([
                {
                    id: 1,
                    sender: 'bot',
                    text: `안녕하세요, ${user?.name || '고객'}님! 무엇을 도와드릴까요?\n아래 자주 묻는 질문을 선택하거나, 직접 질문을 입력해주세요.`,
                    options: getFAQCategories()
                }
            ]);
        }
    }, [isOpen]);

    // Auto-scroll to bottom of messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = (text) => {
        const query = (text || inputText).trim();
        if (!query) return;

        // 1. Add User Message
        const userMsg = { id: Date.now(), sender: 'user', text: query };
        setMessages(prev => [...prev, userMsg]);
        setInputText('');

        // 2. Process Bot Response (Simulate slight delay)
        setTimeout(() => {
            const nlpResult = getChatbotResponse(query);

            let botMsg = { id: Date.now() + 1, sender: 'bot' };

            if (nlpResult) {
                // Matched successfully
                botMsg.text = nlpResult.text;
                botMsg.options = ["다른 질문이 있습니다", "상담원 연결"];
            } else {
                // Match failed
                botMsg.text = "죄송합니다, 입력하신 내용을 정확히 이해하지 못했습니다. \n\n다른 말로 질문해주시거나, 상담원 연결을 통해 관리자에게 직접 문의해주세요.";
                botMsg.options = ["다른 질문이 있습니다", "상담원 연결"];
            }

            setMessages(prev => [...prev, botMsg]);
        }, 500); // 0.5s delay
    };

    const handleOptionClick = (option) => {
        if (option === '상담원 연결') {
            // Trigger parent's modal to connect to admin
            if (onOpenDirectMessage) onOpenDirectMessage();
            setIsOpen(false);
        } else if (option === '다른 질문이 있습니다') {
            setMessages(prev => [
                ...prev,
                { id: Date.now(), sender: 'user', text: option },
                { id: Date.now() + 1, sender: 'bot', text: '무엇을 도와드릴까요?', options: getFAQCategories() }
            ]);
        } else {
            // FAQ Category Category Clicked
            const userMsg = { id: Date.now(), sender: 'user', text: option };
            setMessages(prev => [...prev, userMsg]);

            setTimeout(() => {
                setMessages(prev => [
                    ...prev,
                    { id: Date.now() + 1, sender: 'bot', text: getIntentResponse(option), options: ["다른 질문이 있습니다", "상담원 연결"] }
                ]);
            }, 300);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-24 right-4 w-14 h-14 bg-indigo-600 rounded-full shadow-lg flex items-center justify-center text-white hover:bg-indigo-700 transition-all hover:scale-105 z-50 animate-bounce cursor-pointer group"
                aria-label="고객센터 챗봇 열기"
            >
                <MessageCircle className="w-7 h-7" />
                {/* Tooltip on hover */}
                <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-md pointer-events-none">
                    무엇이든 물어보세요!
                    <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-gray-800 rotate-45"></div>
                </div>
            </button>
        );
    }

    return (
        <div className="fixed bottom-20 right-4 w-80 sm:w-96 h-[500px] max-h-[80vh] bg-white rounded-2xl shadow-2xl flex flex-col z-50 overflow-hidden border border-gray-200 animate-slide-up">
            {/* Header */}
            <div className="bg-indigo-600 text-white p-4 flex justify-between items-center shadow-md z-10 relative">
                <div className="flex items-center gap-2">
                    <div className="bg-white/20 p-1.5 rounded-full">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-sm">약속 챗봇 (Beta)</h3>
                        <p className="text-[10px] text-indigo-200">24시간 자동 응답 시스템</p>
                    </div>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="p-1.5 hover:bg-white/20 rounded-full transition-colors"
                    aria-label="닫기"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Chat History */}
            <div className="flex-1 bg-gray-50 p-4 overflow-y-auto space-y-4">
                {messages.map((msg, idx) => {
                    const msgKey = msg.id || `msg-${idx}`;
                    return (
                        <div key={msgKey} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                            {/* Bubble */}
                            <div className={`flex items-end gap-2 max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                                {msg.sender === 'bot' && (
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-1 border border-indigo-200">
                                        <Bot className="w-5 h-5 text-indigo-600" />
                                    </div>
                                )}
                                <div
                                    className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${msg.sender === 'user'
                                        ? 'bg-indigo-600 text-white rounded-br-none shadow-sm'
                                        : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'
                                        }`}
                                    style={{ lineHeight: '1.4' }}
                                >
                                    {msg.text}
                                </div>
                            </div>

                            {/* Options Cards */}
                            {msg.options && msg.sender === 'bot' && (
                                <div className="mt-2 pl-10 flex flex-wrap gap-2 max-w-[90%]">
                                    {msg.options.map((opt, optIdx) => (
                                        <button
                                            key={`opt-${msgKey}-${optIdx}`}
                                            onClick={() => handleOptionClick(opt)}
                                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${opt === '상담원 연결'
                                                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 font-semibold'
                                                    : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 shadow-sm'
                                                }`}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div >

            {/* Input Area */}
            < div className="p-3 bg-white border-t border-gray-100" >
                <form
                    onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                    className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2"
                >
                    <input
                        type="text"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        placeholder="궁금한 점을 입력해주세요 (예: 돈 언제 입금돼?)"
                        className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-sm py-1 placeholder-gray-400"
                    />
                    <button
                        type="submit"
                        disabled={!inputText.trim()}
                        className={`p-1.5 rounded-full transition-colors ${inputText.trim() ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-300 text-gray-500'
                            }`}
                        aria-label="전송"
                    >
                        <ChevronUp className="w-4 h-4 font-bold" />
                    </button>
                </form>
            </div >
            {/* Custom Animations attached inline via Tailwind configured externally */}
            < style jsx > {`
                @keyframes slide-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-slide-up {
                    animation: slide-up 0.3s ease-out forwards;
                }
            `}</style >
        </div >
    );
}
