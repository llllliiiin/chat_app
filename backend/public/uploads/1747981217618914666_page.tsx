// "use client" を必ず含める
"use client";
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

      if (parsed.type === "read_update" && parsed.message_id) {
        setMessageReads((prev) => ({
          ...prev,
          [parsed.message_id]: parsed.readers || [],
        }));
      }

      if (parsed.type === "new_message" && parsed.message) {
        const msg = parsed.message;
        setMessages((prev) => [
          ...prev,
          {
            id: msg.id,
            sender: msg.sender,
            content: msg.content,
            attachment: msg.attachment || undefined,
          },
        ]);
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
        const msgs = (data.messages || []).map((m: any) => ({
          id: m.id,
          content: m.content,
          sender: m.sender,
          attachment: m.attachment || undefined,
          readers: [],
        }));
        setMessages(msgs);
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
      <div className="flex justify-between items-center bg-white p-4 border-b shadow-sm h-20" style={{ backgroundColor: "#f5fffa" }}>
        <h2 className="absolute left-1/2 transform -translate-x-1/2 text-lg text-[#2e8b57] font-semibold">LINECHAT</h2>
        <div></div>
        <div className="relative">
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
                onClick={async () => {
                  await fetch("http://localhost:8081/logout", {
                    method: "POST",
                    credentials: "include",
                  });
                  router.push("/login");
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-500"
              >
                ログアウト
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
                  <div className={`p-2 rounded-lg max-w-xs ${isSender ? "bg-blue-500" : "bg-green-700"} text-white`}>
                    <div className="text-xs font-semibold mb-1">{msg.sender}</div>
                    <div>
                      {msg.content && <div>{msg.content}</div>}
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
                    </div>
                    <div className="text-[10px] mt-1 text-right">
                      {readers.length === 0 ? "未読" : `既読 ${readers.length}人: ${readers.join(", ")}`}
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
                <div className="flex space-x-2 text-xl text-gray-600">
                  <button onClick={() => document.getElementById("file-upload")?.click()} title="ファイル">📎</button>
                  <button onClick={() => document.getElementById("image-upload")?.click()} title="画像">🖼️</button>
                  <button onClick={() => alert("スタンプ機能は未実装です")} title="スタンプ">💬</button>
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