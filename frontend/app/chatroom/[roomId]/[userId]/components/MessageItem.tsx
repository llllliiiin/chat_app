import React from "react";

interface Props {
  msg: {
    id: number;
    sender: string;
    content: string;
    thread_root_id?: number | null;
    attachment?: string;
  };
  quotedMessage?: { sender: string; content: string; attachment?: string };
  isSender: boolean;
  readers: string[];
  reactions: { emoji: string; users: string[] }[];
  actionBoxVisible: number | null;
  currentUser: string;
  actionBoxRefs: React.MutableRefObject<Map<number, HTMLDivElement | null>>;
  setActionBoxVisible: React.Dispatch<React.SetStateAction<number | null>>;
  setReplyTo: React.Dispatch<React.SetStateAction<{ id: number; content: string; sender: string ;thread_root_id?: number;attachment?: string; } | null>>;
  handleHide: (id: number) => void;
  handleRevoke: (id: number) => void;
  handleReaction: (id: number, emoji: string) => void;
}

export default function MessageItem({
  msg,
  isSender,
  readers,
  reactions,
  actionBoxVisible,
  currentUser,
  actionBoxRefs,
  setActionBoxVisible,
  setReplyTo,
  handleHide,
  handleRevoke,
  handleReaction,
  quotedMessage,
}: Props) {
  // console.log("🧩 引用传入状态:", quotedMessage);
  return (
    <div className={`flex items-end ${isSender ? "justify-end" : "justify-start"}`}>
      <div className={`flex items-end ${isSender ? "flex-row" : "flex-row-reverse"} group relative`}>
        <div className="relative z-10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActionBoxVisible((prev) => (prev === msg.id ? null : msg.id));
            }}
            className="w-6 h-6 flex items-center justify-center rounded-full text-[#2e8b57] hover:bg-[#2e8b57]/20 text-sm transition opacity-0 group-hover:opacity-100"
          >
            ⋯
          </button>

          {actionBoxVisible === msg.id && (
            <div
              ref={(el) => {
                actionBoxRefs.current.set(msg.id, el);
              }}
              className={`absolute bottom-full mb-2 ${isSender ? "right-0" : "left-0"} bg-white border rounded shadow px-3 py-1 text-sm text-gray-800 whitespace-nowrap z-50 action-box`}
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => handleHide(msg.id)} className="mt-2 text-[#2e8b57] hover:text-[#1a5e3b] transition  mr-2">削除</button>
              {isSender && (
                <button onClick={() => handleRevoke(msg.id)} className="mt-2 text-[#2e8b57] hover:text-[#1a5e3b] transition">送信取消</button>
              )}
              <button
                onClick={() => {
                  setReplyTo({ id: msg.id, content: msg.content, sender: msg.sender });
                  setActionBoxVisible(null);
                }}
                className="mt-2 text-[#2e8b57] hover:text-[#1a5e3b] transition"
              >
                &nbsp;&nbsp;リプライ
              </button>
              <div className="mt-2 flex space-x-1">
                <button onClick={() => handleReaction(msg.id, "😄")}>😄</button>
                <button onClick={() => handleReaction(msg.id, "👍")}>👍</button>
                <button onClick={() => handleReaction(msg.id, "❤️")}>❤️</button>
              </div>
            </div>
          )}
        </div>

        <div className={`ml-2 mr-2 p-2 rounded-lg max-w-xs ${isSender ? "bg-blue-500" : "bg-green-700"} text-white`}>
          <div className="text-xs font-semibold mb-1">{msg.sender}</div>
          {quotedMessage && (
            <div className="mb-2 px-2 py-1 bg-white/30 rounded text-xs text-white border border-white/40">
              <span className="font-bold"></span>
              {quotedMessage.attachment ? (
                quotedMessage.attachment.match(/\.(jpg|jpeg|png|gif)$/i)
                  ? "｜画像"
                  : "｜ファイル"
              ) : (
                quotedMessage.content
              )}
            </div>
          )}

          {msg.content && <div>{msg.content}</div>}

          <div className="mt-1 flex space-x-2">
            {reactions.map((r) => (
              <div
                key={r.emoji}
                className="text-sm bg-white text-gray-700 rounded-full px-2 py-1 border"
                title={r.users.join(", ")}
              >
                {r.emoji} {r.users.length}
              </div>
            ))}
          </div>

          {msg.attachment && msg.attachment.match(/\.(jpg|jpeg|png|gif)$/i) ? (
            <img
              src={`http://localhost:8081${msg.attachment.startsWith("/uploads/") ? msg.attachment : `/uploads/${msg.attachment}`}`}
              alt="attachment"
              className="mt-2 rounded shadow max-w-full h-auto"
            />
          ) : msg.attachment ? (
            <a
              href={`http://localhost:8081${msg.attachment.startsWith("/uploads/") ? msg.attachment : `/uploads/${msg.attachment}`}`}
              target="_blank"
              className="text-blue-200 underline text-sm block mt-2"
            >
              📎 添付ファイルを開く
            </a>
          ) : null}

          <div className="text-[10px] mt-1 text-right">
            {readers.length === 0
              ? "未読"
              : `既読`}
              {/* : `既読 ${readers.length}人: ${readers.join(", ")}`} */}
          </div>
        </div>
      </div>
    </div>
  );
}
