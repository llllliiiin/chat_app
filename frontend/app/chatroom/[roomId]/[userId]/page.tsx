// "use client" を必ず含める
"use client";
import EmojiPicker from 'emoji-picker-react';
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

interface RoomInfo {
  id: number;
  room_name: string;
  is_group: boolean;
}

export default function UserPage() {
  const [showMenu, setShowMenu] = useState(false); // 👈 メニューの表示を制御
  const router = useRouter();
  const { roomId, userId } = useParams();

  const [users, setUsers] = useState<string[]>([]);
  const [message, setMessage] = useState(""); // 入力中の内容
  const [messages, setMessages] = useState<{ id: number; content: string; sender: string; readers?: string[]; attachment?: string }[]>([]);

  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesInputRef = useRef<HTMLInputElement>(null);

  const [messageReads, setMessageReads] = useState<Record<number, string[]>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [groupRooms, setGroupRooms] = useState<RoomInfo[]>([]);
  const [userToRoomIdMap, setUserToRoomIdMap] = useState<Record<string, number>>({});
  const [webSocketStatus, setWebSocketStatus] = useState<string>("undefined");

  const wsRef = useRef<WebSocket | null>(null); // WebSocket の再接続対策

  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [actionBoxVisible, setActionBoxVisible] = useState<number | null>(null);
  const actionBoxRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const [messageReactions, setMessageReactions] = useState<Record<number, { emoji: string; users: string[] }[]>>({});


  // 初期化：ログインチェック & ユーザー一覧の取得
  useEffect(() => {
    fetch("http://localhost:8081/me", { credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          router.push("/login");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.username) {
          setCurrentUser(data.username);
          fetch("http://localhost:8081/users", { credentials: "include" })
            .then(async (res) => {
              if (!res.ok) throw new Error(await res.text());
              return res.json();
            })
            .then((data: { users: string[] }) => {
              setUsers(data.users);
              setChecking(false);
            })
            .catch((err) => {
              console.error("ユーザー取得失敗：", err);
              setError(err.message || "読み込み失敗");
              setChecking(false);
            });
        }
      });
  }, [router]);

  // 入室通知
  useEffect(() => {
    if (!roomId || !currentUser) return;

    const tryEnter = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        fetch(`http://localhost:8081/rooms/${roomId}/enter`, {
          method: "POST",
          credentials: "include",
        });
      } else {
        setTimeout(tryEnter, 100); // 接続待ち
      }
    };
    tryEnter();
  }, [roomId, currentUser]);

  const fetchReads = async () => {
    const result: Record<number, string[]> = {};
    try {
      for (const msg of messages) {
        const res = await fetch(`http://localhost:8081/messages/${msg.id}/readers`, {
          credentials: "include",
        });
        const data = await res.json();
        result[msg.id] = data.readers || [];
      }
      setMessageReads(result);
    } catch (err) {
      console.error("既読データ取得失敗", err);
    }
  };

  useEffect(() => {
    if (!roomId || !currentUser) return;

    if (wsRef.current) wsRef.current.close();
    const ws = new WebSocket(`ws://localhost:8081/ws?room_id=${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket 接続成功");
      setWebSocketStatus("connected");
    };

    ws.onerror = (event) => {
      console.error("❌ WebSocket エラー", event);
      setWebSocketStatus("error");
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket 切断");
      setWebSocketStatus("closed");
    };

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);

      if (parsed.type === "message_revoked" && parsed.message_id) {
        setMessages((prev) => prev.filter((m) => m.id !== parsed.message_id));
      }

      if (parsed.type === "read_update" && parsed.message_id) {
        setMessageReads((prev) => ({
          ...prev,
          [parsed.message_id]: parsed.readers || [],
        }));
      }

      if (parsed.type === "new_message" && parsed.message) {
        const msg = parsed.message;
        const content = msg.content || "";

        // ✅ 處理 reaction 類型
        if (content.startsWith("reaction:")) {
          const [, emoji, targetIdStr] = content.split(":");
          const targetId = parseInt(targetIdStr);

          setMessageReactions((prev) => {
            const oldList = prev[targetId] || [];
            const existing = oldList.find((r) => r.emoji === emoji);
            let updated;

            if (existing) {
              const hasReacted = existing.users.includes(msg.sender);
              updated = hasReacted
                ? oldList
                    .map((r) =>
                      r.emoji === emoji
                        ? { ...r, users: r.users.filter((u) => u !== msg.sender) }
                        : r
                    )
                    .filter((r) => r.users.length > 0)
                : oldList.map((r) =>
                    r.emoji === emoji
                      ? {
                          ...r,
                          users: [...r.users, msg.sender].filter((v, i, a) => a.indexOf(v) === i),
                        }
                      : r
                  );
            } else {
              updated = [...oldList, { emoji, users: [msg.sender] }];
            }

            return { ...prev, [targetId]: updated };
          });

          return; // ✅ 不加入普通 message 列表
        }

        // 普通訊息照常處理
        setMessages((prev) => [...prev, {
          id: msg.id,
          sender: msg.sender,
          content: msg.content,
          attachment: msg.attachment || undefined,
        }]);
      }

    };

    return () => {
      ws.close();
    };
  }, [roomId, currentUser]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!messages || !currentUser) return;
    messages.forEach((msg) => {
      if (msg.sender !== currentUser) {
        fetch(`http://localhost:8081/messages/${msg.id}/markread`, {
          method: "POST",
          credentials: "include",
        }).catch((err) => console.error("既読マーク失敗", err));
      }
    });

    setTimeout(() => {
      fetchReads();
      fetchRoomsAndUnreadCounts();
    }, 300);
  }, [messages, currentUser]);

  useEffect(() => {
    if (!roomId || !currentUser) return;
    fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        const rawMessages = data.messages || [];

        const normalMessages: typeof messages = [];
        const reactionMap: Record<number, Record<string, string[]>> = {};

        for (const m of rawMessages) {
          if (m.content?.startsWith("reaction:")) {
            const [, emoji, targetIdStr] = m.content.split(":");
            const targetId = parseInt(targetIdStr);
            if (!reactionMap[targetId]) reactionMap[targetId] = {};
            if (!reactionMap[targetId][emoji]) reactionMap[targetId][emoji] = [];
            if (!reactionMap[targetId][emoji].includes(m.sender)) {
              reactionMap[targetId][emoji].push(m.sender);
            }
          } else {
            normalMessages.push({
              id: m.id,
              content: m.content,
              sender: m.sender,
              attachment: m.attachment || undefined,
              readers: [],
            });
          }
        }

        setMessages(normalMessages);

        const structured: typeof messageReactions = {};
        for (const [msgIdStr, emojiGroup] of Object.entries(reactionMap)) {
          const msgId = parseInt(msgIdStr);
          structured[msgId] = Object.entries(emojiGroup).map(([emoji, users]) => ({
            emoji,
            users,
          }));
        }
        setMessageReactions(structured);
      });

  }, [roomId, currentUser]);

  const fetchRoomsAndUnreadCounts = async () => {
    const res = await fetch("http://localhost:8081/oneroom", {
      credentials: "include",
    });

    if (!res.ok) throw new Error("ルーム取得失敗");
    const allRooms: RoomInfo[] = await res.json();
    if (!Array.isArray(allRooms)) return;

    const matchedRooms = allRooms.filter((room) => room.is_group === false);
    setGroupRooms(matchedRooms);


    const newUserToRoomIdMap: Record<string, number> = {};

    for (const room of matchedRooms) {
      if (!room.room_name.includes("_") || !currentUser) continue;

      const parts = room.room_name.split("_"); // ❗ 不要 lowerCase
      const me = currentUser;

      const otherUser = parts.find((name) => name !== me);

      if (otherUser) {
        newUserToRoomIdMap[otherUser] = room.id;
      }
    }

    console.log("✅ userToRoomIdMap 正確建立 =", newUserToRoomIdMap);
    setUserToRoomIdMap(newUserToRoomIdMap);
    console.log("🧪 渲染中使用者清單：", users);
    console.log("🧪 當前使用者 currentUser：", currentUser);
    console.log("🧪 userToRoomIdMap keys：", Object.keys(userToRoomIdMap));




    const counts: Record<string, number> = {};
    for (const room of matchedRooms) {
      const res = await fetch(`http://localhost:8081/rooms/${room.id}/unread-count`, {
        credentials: "include",
      });
      const data = await res.json();
      counts[room.id] = data.unread_count;
    }
    setUnreadCounts(counts);
    console.log(counts);
  };

  // ✅ 只有在 currentUser 存在時才會觸發 fetchRoomsAndUnreadCounts
  useEffect(() => {
    if (!currentUser) {
      console.warn("⚠️ currentUser 為 null，跳過 fetchRoomsAndUnreadCounts 初始化");
      return;
    }
    fetchRoomsAndUnreadCounts(); // 首次抓取
    const interval = setInterval(() => {
      if (currentUser) {
        fetchRoomsAndUnreadCounts(); // 定時刷新
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [currentUser]); // 👈 依賴 currentUser
  
  const handleReaction = async (targetMessageId: number, emoji: string) => {
    await fetch("http://localhost:8081/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        room_id: parseInt(roomId as string),
        content: `reaction:${emoji}:${targetMessageId}`,
        thread_root_id: null,
        mentions: [],
      }),
    });
  };


  const handleUserClick = async (targetUser: string) => {
    const res = await fetch("http://localhost:8081/get-or-create-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ user1: currentUser, user2: targetUser }),
    });

    const data = await res.json();
    const actualRoomId = data.room_id;

    await fetch(`http://localhost:8081/rooms/${actualRoomId}/enter`, {
      method: "POST",
      credentials: "include",
    });

    setUnreadCounts((prev) => ({ ...prev, [data.room_id]: 0 }));
    router.push(`/chatroom/${data.room_id}/${targetUser}`);
  };

  const handleSend = async () => {
    const parsedRoomId = parseInt(roomId as string, 10);

    if (!message.trim()) return;
    if (!roomId || isNaN(parsedRoomId) || parsedRoomId <= 0) {
      alert("無効なルームIDです");
      return;
    }

    try {
      await fetch("http://localhost:8081/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          room_id: parsedRoomId,
          content: message,
          thread_root_id: null,
        }),
      });

      setMessage("");
      setTimeout(() => {
        fetchReads();
      }, 300);
    } catch (err) {
      alert("送信失敗");
    }
  };
  
    ///////////////////////
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // 遍历所有菜单浮出的 ref
      for (const [, ref] of actionBoxRefs.current) {
        if (ref && ref.contains(target)) {
          return; // 点在菜单内部，不关闭
        }
      }

      // 点在外部，关闭菜单
      setActionBoxVisible(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /////////////////////////

  ///revoke
  const handleRevoke = async (msgId: number) => {
    const res = await fetch(`http://localhost:8081/messages/${msgId}/revoke`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      setMessages(prev => prev.filter(m => m.id !== msgId));
      actionBoxRefs.current.delete(msgId); // ← 清理对应引用
    } else {
      alert("撤回に失敗しました（2分以上経過した可能性があります）");
    }
  };

   //hide
  const handleHide = async (msgId: number) => {
    const res = await fetch(`http://localhost:8081/messages/${msgId}/hide`, {
      method: "POST",
      credentials: "include",
    });
    if (res.ok) {
      setMessages(prev => prev.filter(m => m.id !== msgId));
      actionBoxRefs.current.delete(msgId); // ← 清理对应引用
    } else {
      alert("削除に失敗しました");
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;

    const reader = new FileReader();
    reader.onload = () => setPreviewImage(reader.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("room_id", roomId.toString());
    formData.append("type", "image");

    await fetch("http://localhost:8081/messages/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    setPreviewImage(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !roomId) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("room_id", roomId.toString());
    formData.append("type", "file");

    await fetch("http://localhost:8081/messages/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });
  };

  if (checking) {
    return <div className="h-screen flex justify-center items-center">Loading...</div>;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* 共通ヘッダー */}
      <div
        className="relative flex justify-center items-center bg-white p-4 border-b shadow-sm h-20"
        style={{ backgroundColor: "#f5fffa" }}
      >
        {/* ← 戻るボタン（チャットルーム一覧へ） */}
        <button
          onClick={() => router.push("/chatroom")}
          className="absolute left-4 top-1/2 transform -translate-y-1/2 text-[#2e8b57] hover:text-green-800 transition"
          aria-label="Back to Room List"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h2 className="text-lg text-[#2e8b57] font-semibold">LINECHAT</h2>

        {/* 右側メニューアイコンそのまま保留 */}
        <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
          <img
            src="/window.svg"
            alt="My Avatar"
            className="w-8 h-8 rounded-full cursor-pointer"
            onClick={() => setShowMenu((prev) => !prev)}
          />
          {showMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-200 rounded shadow-lg z-10">
              <button onClick={() => router.push("/")} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">ホームページ</button>
              <button
                onClick={() => router.push("/login")}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-500"
              >
                ログイン画面へ
              </button>
            </div>
          )}
        </div>
      </div>


      <div className="flex-1 flex min-h-0">
        {/* 左邊用戶列表 */}
        <div className="w-1/4 p-4 flex flex-col min-h-0" style={{ backgroundColor: "#2e8b57" }}>
          <h2 className="text-xl text-white font-bold mb-4 text-center">ユーザー一覧</h2>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide pr-1">
            <ul className="space-y-3 w-2/3 mx-auto">
              {users.filter((user) => user !== currentUser).map((user) => (
                <li
                  key={user}
                  // onClick={() => router.push(`/chatroom/${roomId}/${encodeURIComponent(user)}`)}
                  //瀏覽器會自動將 /chatroom/ルーム1/さとう 編碼為 /chatroom/%E3%83%AB%E3%83%BC%E3%83%A01/%E3%81%95%E3%81%A8%E3%81%86；
                  //而 useParams() 拿到的是「原始 URL 字串」，所以需要手動 decode 才能在畫面中還原。
                  onClick={() => handleUserClick(user)}
                  className="relative p-2 bg-white rounded shadow hover:bg-gray-200 flex justify-center items-center mx-auto cursor-pointer"
                >
                  {user}
                  {userToRoomIdMap[user] !== undefined && unreadCounts[userToRoomIdMap[user]] > 0 && (
                    <span className="absolute right-1 top-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow"></span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 聊天視窗 */}
        <div className="w-3/4 flex flex-col min-h-0">
          <div className="bg-white p-4 border-b">
            <h2 className="text-lg font-semibold">{decodeURIComponent(userId as string)}</h2>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 bg-gray-50 scrollbar-hide">
            {messages.map((msg) => {
              const readers = messageReads[msg.id] || [];
              const isSender = msg.sender === currentUser;
              return (
                <div key={msg.id} className={`flex ${isSender ? "justify-end" : "justify-start"}`}>
                  <div className={`flex items-end ${isSender ? "flex-row" : "flex-row-reverse"} group relative`}>
                    
                    {/* 三点按钮 */}
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

                      {/* 对方：左上浮出 */}
                      {!isSender && actionBoxVisible === msg.id && (
                        <div
                          ref={(el) => {
                            actionBoxRefs.current.set(msg.id, el);
                          }}
                          className="absolute bottom-full mb-2 left-0 bg-white border rounded shadow px-3 py-1 text-sm text-gray-800 whitespace-nowrap z-50 action-box"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleHide(msg.id)}
                            className="hover:underline"
                          >
                            削除
                          </button>
                          <div className="mt-2 flex gap-x-2 justify-start">
                            <button onClick={() => handleReaction(msg.id, "😄")}>😄</button>
                            <button onClick={() => handleReaction(msg.id, "👍")}>👍</button>
                            <button onClick={() => handleReaction(msg.id, "❤️")}>❤️</button>
                          </div>
                        </div>
                      )}

                      {/* 自己：右上浮出 */}
                      {isSender && actionBoxVisible === msg.id && (
                        <div
                          ref={(el) => {
                            actionBoxRefs.current.set(msg.id, el);
                          }}
                          className="absolute bottom-full mb-2 right-0 bg-white border rounded shadow px-3 py-1 text-sm text-gray-800 whitespace-nowrap z-50 action-box"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleHide(msg.id)}
                            className="hover:underline mr-2"
                          >
                            削除
                          </button>
                          <button
                            onClick={() => handleRevoke(msg.id)}
                            className="hover:underline"
                          >
                            送信取消
                          </button>
                          <div className="mt-2 flex gap-x-2 justify-start">
                            <button onClick={() => handleReaction(msg.id, "😄")}>😄</button>
                            <button onClick={() => handleReaction(msg.id, "👍")}>👍</button>
                            <button onClick={() => handleReaction(msg.id, "❤️")}>❤️</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 消息气泡 */}
                    <div className={`ml-2 mr-2 p-2 rounded-lg max-w-xs ${isSender ? "bg-blue-500" : "bg-green-700"} text-white`}>
                      <div className="text-xs font-semibold mb-1">{msg.sender}</div>
                      {msg.content && <div>{msg.content}</div>}

                      <div className="mt-1 flex space-x-2">
                        {(messageReactions[msg.id] || []).map(r => (
                          <div
                            key={r.emoji}
                            className="text-sm bg-white text-gray-700 rounded-full px-2 py-1 border"
                            title={r.users.join(", ")}
                          >
                            {r.emoji} {r.users.length}
                          </div>
                        ))}
                      </div>

                      {/* 附件逻辑略 */}
                      <div className="text-[10px] mt-1 text-right">
                        {readers.length === 0 ? "未読" : `既読 ${readers.length}人: ${readers.join(", ")}`}
                      </div>
                    </div>
                  </div>
                </div>

              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* ===== 精簡後聊天輸入區（功能列靠左，自動增高）===== */}
          <div className="border-t bg-white px-4 py-3">
            {/* 預覽圖片（可選） */}
            {previewImage && (
              <div className="mb-2 relative w-fit">
                <img src={previewImage} className="max-h-48 rounded shadow" alt="preview" />
                <button
                  onClick={() => setPreviewImage(null)}
                  className="absolute -top-2 -right-2 bg-black text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex items-end">
              {/* 功能按鈕列（左下） */}
              <div className="flex flex-col justify-end mr-2">
                <input type="file" id="file-upload" style={{ display: "none" }} onChange={handleFileUpload} />
                <input type="file" accept="image/*" id="image-upload" style={{ display: "none" }} onChange={handleImageUpload} />
                <div className="relative flex space-x-2 text-xl text-gray-600">
                  <button onClick={() => document.getElementById("file-upload")?.click()} title="ファイル">📎</button>
                  <button onClick={() => document.getElementById("image-upload")?.click()} title="画像">🖼️</button>
                  <button onClick={() => setShowEmojiPicker(prev => !prev)} title="絵文字">😊</button>
                  {showEmojiPicker && (
                    <div
                      className="absolute z-50 bg-white rounded shadow-lg origin-bottom-left"
                      style={{
                        bottom: '100%',
                        left: 0,
                        transform: 'translateY(-10px) scale(0.75)', // 等比缩小整个 UI
                        transformOrigin: 'bottom left',
                      }}
                    >
                      <EmojiPicker
                        onEmojiClick={(emojiData) => {
                          setMessage((prev) => prev + emojiData.emoji); // 插入的是 emoji 字符，不受视觉缩放影响
                          setShowEmojiPicker(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* 輸入欄與送信按鈕 */}
              <div className="flex-1 flex flex-col">
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm resize-none max-h-36 overflow-y-auto"
                  rows={1}
                  placeholder="メッセージを入力...（Enterで送信 / Shift+Enterで改行）"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                />
              </div>

              {/* 送信按鈕 */}
              <div className="ml-3">
                <button
                  onClick={handleSend}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  送信
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}