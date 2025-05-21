"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

interface RoomInfo {
  id: number;
  room_name: string;
  is_group: boolean;
}

export default function UserPage() {
  const [showMenu, setShowMenu] = useState(false); // 👈 控制菜单显示
  const router = useRouter();

  const { roomId, userId } = useParams();
  const [users, setUsers] = useState<string[]>([]);
  const [message, setMessage] = useState(""); // 使用者正在輸入的內容
  // const [messages, setMessages] = useState<{ content: string; sender: "me" | "other" }[]>([]);
  const [messages, setMessages] = useState<{id: number; content: string; sender: string; readers?: string[] }[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesInputRef = useRef<HTMLInputElement>(null);
  const [messageReads, setMessageReads] = useState<Record<number, string[]>>({})
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});
  const [groupRooms, setGroupRooms] = useState<RoomInfo[]>([]);
  const [userToRoomIdMap, setUserToRoomIdMap] = useState<Record<string, number>>({});
  // 在 useState 中添加 webSocketStatus 来跟踪连接状态
  const [webSocketStatus, setWebSocketStatus] = useState<string>("undefined");


  const wsRef = useRef<WebSocket | null>(null);//爲了解決前面的websocket沒有關閉，出現雙重消息的情況

  interface Message {
    id: number;
    content: string;
    sender: string;
    readers: string[];
  }
  // 初始化：登入驗證與取得用戶清單
  useEffect(() => {
    const currentUser = sessionStorage.getItem("currentUser");
    const token = sessionStorage.getItem("token");

    if (!token || !currentUser) {
      router.push("/login");
      return;
    }

    setCurrentUser(currentUser);
    setToken(token);

    fetch("http://localhost:8081/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then((data: { users: string[] }) => {
        setUsers(data.users);
        setChecking(false);
      })
      .catch((err) => {
        console.error("获取用户失败：", err);
        setError(err.message || "加载失败");
        setChecking(false);
      });
  }, []);

    useEffect(() => {
    if (!roomId || !token) return;

    const tryEnter = () => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        fetch(`http://localhost:8081/rooms/${roomId}/enter`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } else {
        setTimeout(tryEnter, 100); // 等待 WebSocket 連上
      }
      console.log("WebSocket status:", wsRef.current?.readyState);

    };

    tryEnter();
  }, [roomId, token]);


/////////////////////////
  const fetchReads = async () => {
    const result: Record<number, string[]> = {};
    try {
      for (const msg of messages) {
        const res = await fetch(`http://localhost:8081/messages/${msg.id}/readers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        result[msg.id] = data.readers || [];
      }
      setMessageReads(result);
    } catch (err) {
      console.error("讀取 messageReads 時發生錯誤", err);
    }
  };

  ///////web socket建議放在「與 WebSocket 有關的 state（如 token、currentUser、roomId）都已設定完成之後」
// useEffect：驗證登入、取得使用者列表（✅ 最早）
// useEffect：根據 roomId 取得歷史訊息（✅ 第二）
// ✅ 👉 把 WebSocket 的 useEffect 放這裡
// useEffect：訊息滾動到最底部（不依賴 token，放後面 OK）
  useEffect(() => {
    if (!roomId || !token) return;

    // 清理旧的 WebSocket 连接
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(`ws://localhost:8081/ws?room_id=${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket 连接成功");
      setWebSocketStatus("connected"); // 设置连接成功状态
    };

    ws.onerror = (event) => {
      console.error("❌ WebSocket 错误", event);
      setWebSocketStatus("error"); // 设置错误状态
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket 已关闭");
      setWebSocketStatus("closed"); // 设置关闭状态
    };

    ws.onmessage = (event) => {
      const parsed = JSON.parse(event.data);

      // 如果收到的是已读更新消息
      if (parsed.type === "read_update" && parsed.message_id) {
        setMessageReads((prev) => ({
          ...prev,
          [parsed.message_id]: parsed.readers || []
        }));
      }

      // 收到新消息
      if (parsed.type === "new_message" && parsed.message) {
        const msg = parsed.message;
        setMessages((prev) => [
          ...prev,
          {
            id: msg.id,
            sender: msg.sender,
            content: msg.content,
          }
        ]);
        setTimeout(() => {
          fetchReads(); // 获取已读用户列表
        }, 300);
      }
    };

    return () => {
      ws.close(); // 在离开房间时关闭连接
    };
  }, [roomId, token]); // 当 roomId 或 token 变化时重新建立 WebSocket 连接

        ///////////////////

  // 自動滾動至最新訊息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  useEffect(() => {
    if (!messages || !token || !currentUser) return;
    messages.forEach((msg) => {
      if (msg.sender !== currentUser) {
        fetch(`http://localhost:8081/messages/${msg.id}/markread`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => console.error("标记已读失败", err));
      }
    });

    // 延遲一點點時間讓資料寫入 DB，再 fetch reads
    setTimeout(() => {
      fetchReads();
    }, 300); // 300ms 實測穩定足夠
  }, [messages, currentUser, token]);



  // 加載訊息紀錄
  useEffect(() => {
    if (!roomId || !token || !currentUser) return;

    fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const msgs = (data.messages || []).map((m: any) => ({
          id: m.id,
          content: m.content,
          sender: m.sender,
          readers: [],
        }));
        setMessages(msgs);
        console.log("⚠️ 收到的 messages 是：", data.messages);
      });
  }, [roomId, token, currentUser]);

  

  //////// ✅ 初始化：從後端獲取所有已存在的房間，對照預設名稱，取得未讀訊息
 const fetchRoomsAndUnreadCounts = async () => {
    if (!token) return;

    const res = await fetch("http://localhost:8081/oneroom", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('获取房间失败');
    const allRooms: RoomInfo[] = await res.json();

    if (!Array.isArray(allRooms)) return;  // 确保是数组

    const matchedRooms: RoomInfo[] = allRooms.filter(
       (room) => room.is_group === false // 筛选一对一房间
    );

    setGroupRooms(matchedRooms);
    /////////////////////////////////////////
    const userToRoomId: Record<string, number> = {};

    for (const room of matchedRooms) {
      const parts = room.room_name.split("_");
      const otherUser = parts.find((name) => name !== currentUser);
      if (otherUser) {
        userToRoomId[otherUser] = room.id;
      }
    }

    setUserToRoomIdMap(userToRoomId); // 你要加上 useState
/////////////////////////////////////////

    const counts: Record<string, number> = {};
    for (const room of matchedRooms) {
      const res = await fetch(`http://localhost:8081/rooms/${room.id}/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      counts[room.id] = data.unread_count;  // counts = {101: 5, 102: 2, 103: 0}
    }
    setUnreadCounts(counts);
  };

  useEffect(() => {
    if (token) {
      fetchRoomsAndUnreadCounts();
      const interval = setInterval(fetchRoomsAndUnreadCounts, 10000); // 每 10 秒輪詢一次
      return () => clearInterval(interval);
    }
  }, [token]);
  

  // 點選左側用戶切換聊天對象
  const handleUserClick = async (targetUser: string) => {
    const currentUser = sessionStorage.getItem("currentUser");
    const token = sessionStorage.getItem("token");
    if (!currentUser || !token) return;
    // 获取或创建房间
    const res = await fetch("http://localhost:8081/get-or-create-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user1: currentUser, user2: targetUser }),
    });

    const data = await res.json();

    
    // 更新未读消息计数
    setUnreadCounts((prev) => ({ ...prev, [data.room_id]: 0 }));

    router.push(`/chatroom/${data.room_id}/${targetUser}`);
  };


  // 發送訊息
  const handleSend = async () => {
    const token = sessionStorage.getItem("token");
    const parsedRoomId = parseInt(roomId as string, 10);

    if (!message.trim()) return;
    if (!token) {
      alert("請先登入");
      return;
    }
    if (!roomId || isNaN(parsedRoomId) || parsedRoomId <= 0) {
      alert("房間 ID 無效");
      return;
    }

    try {
      await fetch("http://localhost:8081/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          room_id: parsedRoomId,
          content: message,
          thread_root_id: null,
        }),
      });

      setMessage("");////將輸入欄清空，爲了避免websocket雙重發送的問題，不在上面加setmessages了

      // 发送消息后立即标记为已读
      messages.forEach((msg) => {
        if (msg.sender !== currentUser) {
          fetch(`http://localhost:8081/messages/${msg.id}/markread`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          }).catch((err) => console.error("标记已读失败", err));
        }
      });

      // 刷新已读状态
      setTimeout(() => {
        fetchReads(); // 获取已读用户列表
      }, 300);
    } catch (err) {
      alert("訊息發送失敗");
    }
  };
  
  
      ///此處并沒有await json目的是爲了讓畫面實時更新，顯得流暢，是optimistic UI
      // 把訊息加入本地訊息列表
      ///...是展開原本的messages的意思，再加上新的信息content和sender
      // setMessages([...messages, { content: message, sender: "me" }]);
     //因為這條訊息還 沒經過後端寫入 → 再經過 GET 拉下來 → 再比對 sender。
     // 你只知道： 是你剛打的 是你剛送出的所以它一定來自「你自己」
     // 👉 所以程式 主動指定 sender 為 "me"，來讓畫面能立刻知道它應該靠右顯示、藍色氣泡等。
       // ✅ 發送後直接樂觀更新畫面（因為 WebSocket 不會 echo 給自己）
      


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
              <button onClick={() => router.push("/")} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm">
                ホームページ
              </button>
              <button
                onClick={() => {
                  sessionStorage.removeItem("token");
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
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === currentUser ? "justify-end" : "justify-start"}`}>
                <div className={`p-2 rounded-lg max-w-xs ${msg.sender === currentUser ? "bg-blue-500 text-white" : "bg-green-700 text-white"}`}>
                  {msg.content}
                  {msg.sender === currentUser && (
                      <div className="text-[10px] mt-1 text-right">
                      {(messageReads[msg.id]?.length ?? 0) > 0 ? "已讀" : "未讀"}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t flex items-center bg-white">
            <input
              ref={messagesInputRef}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
              type="text"
              placeholder="メッセージを入力..."
              className="flex-1 border rounded px-3 py-2 mr-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
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
  );
}
