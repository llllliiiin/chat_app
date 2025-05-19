"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

export default function UserPage() {
  const [showMenu, setShowMenu] = useState(false); // 👈 控制菜单显示
  const router = useRouter();

  const { roomId, userId } = useParams();
  const [users, setUsers] = useState<string[]>([]);
  const [message, setMessage] = useState(""); // 使用者正在輸入的內容
  const [messages, setMessages] = useState<{ content: string; sender: "me" | "other" }[]>([]);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesInputRef = useRef<HTMLInputElement>(null);

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

  // 加載訊息紀錄
  useEffect(() => {
    if (!roomId || !token || !currentUser) return;

    fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const msgs = (data.messages || []).map((m: any) => ({
          content: m.content,
          sender: m.sender === currentUser ? "me" : "other",
        }));
        setMessages(msgs);
      });
  }, [roomId, token, currentUser]);

  // 自動滾動至最新訊息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 點選左側用戶切換聊天對象
  const handleUserClick = async (targetUser: string) => {
    const currentUser = sessionStorage.getItem("currentUser");
    const token = sessionStorage.getItem("token");
    if (!currentUser || !token) return;

    const res = await fetch("http://localhost:8081/get-or-create-room", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ user1: currentUser, user2: targetUser }),
    });

    const data = await res.json();
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
      ///此處并沒有await json目的是爲了讓畫面實時更新，顯得流暢，是optimistic UI
      // 把訊息加入本地訊息列表
      ///...是展開原本的messages的意思，再加上新的信息content和sender
      setMessages([...messages, { content: message, sender: "me" }]);
     //因為這條訊息還 沒經過後端寫入 → 再經過 GET 拉下來 → 再比對 sender。
     // 你只知道： 是你剛打的 是你剛送出的所以它一定來自「你自己」
     // 👉 所以程式 主動指定 sender 為 "me"，來讓畫面能立刻知道它應該靠右顯示、藍色氣泡等。
      setMessage("");////將輸入欄清空
    } catch (err) {
      alert("訊息發送失敗");
    }
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
                  className="p-2 bg-white rounded shadow hover:bg-gray-200 flex justify-center items-center mx-auto cursor-pointer"
                >
                  {user}
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
              <div key={idx} className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
                <div className={`p-2 rounded-lg max-w-xs ${msg.sender === "me" ? "bg-blue-500 text-white" : "bg-green-700 text-white"}`}>
                  {msg.content}
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

