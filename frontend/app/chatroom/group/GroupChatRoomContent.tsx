"use client";
import { useParams, useRouter,useSearchParams } from "next/navigation";
import { useEffect, useState, useRef} from "react";
///在 app/ router 中，useSearchParams() 是一個 只能在 client 元件使用的 Hook，並且必須包在 <Suspense> 裡面使用，否則在 prerender 階段就會報錯（就像你現在看到的情況）。


export default function GroupChatRoomContent() {
  const wsRef = useRef<WebSocket | null>(null);//爲了解決前面的websocket沒有關閉，出現雙重消息的情況
  // const { roomId } = useParams();
  const searchParams = useSearchParams();
  const roomId = searchParams.get("room_id");
  const router = useRouter();
  
  const [showMenu, setShowMenu] = useState(false);
  // const [messages, setMessages] = useState<{ content: string; sender: string }[]>([]);
  const [message, setMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [roomTitle, setRoomTitle] = useState<string>("グループチャット");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageReads, setMessageReads] = useState<Record<number, string[]>>({})
  const [messages, setMessages] = useState<{ id: number; content: string; sender: string }[]>([]);
  const [webSocketStatus, setWebSocketStatus] = useState<string>("undefined");
/////畫面中央顯示離開房閒
  const [systemMessage, setSystemMessage] = useState<string | null>(null);

  useEffect(() => {
    const current = sessionStorage.getItem("currentUser");
    const token = sessionStorage.getItem("token");


    if (!current || !token) {
      router.push("/login");
      return;
    }
    setCurrentUser(current);
    setToken(token);
  }, [router]);

  useEffect(() => {
    if (!roomId || !token) return;

    fetch(`http://localhost:8081/rooms/${roomId}/join-group`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("members:", data.members);
        setMembers(data.members || []);
      });

    fetch(`http://localhost:8081/rooms/${roomId}/info`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.room_name) {
          setRoomTitle(data.room_name);
        }
      });

    fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const msgs = (data.messages || []).map((m: any) => ({
          id: m.id,
          content: m.content,
          sender: m.sender,
        }));
        setMessages(msgs);
      });
  }, [roomId, token]);



  ////////////////////////////////
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

//////////////////////////////////////

  /////////////////websocket

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
      fetch(`http://localhost:8081/rooms/${roomId}/enter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
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

        // fetchReads();
        // setTimeout(() => {
        //   fetchReads(); // 获取已读用户列表
        // }, 300);
      }

        // ✅ 新增處理 user_entered
      if (parsed.type === "user_entered"|| parsed.type === "user_left") {
        const username = parsed.user;
        if (username !== currentUser) {
          const message = parsed.type === "user_entered"
            ? `${username}さんが入室しました`
            : `${username}さんが退室しました`;

          setSystemMessage(message);
          setTimeout(() => setSystemMessage(null), 2500);
        }

        // 🔁 拉一次最新成員列表
        fetch(`http://localhost:8081/rooms/${roomId}/join-group`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((data) => {
            setMembers(data.members || []);
          });
        
        // 2. 拉 messages
        fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((data) => {
            const msgs = (data.messages || []).map((m: any) => ({
              id: m.id,
              content: m.content,
              sender: m.sender,
            }));
            setMessages(msgs); // ✅ 這會觸發 markread 和 fetchReads useEffect
          });
          
        // fetchReads();
        // setTimeout(() => {
        //   fetchReads();
        // }, 300);
      }
    };

    return () => {
      ws.close(); // 在离开房间时关闭连接
    };
  }, [roomId, token]); // 当 roomId 或 token 变化时重新建立 WebSocket 连接


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {

    if (!messages || !token || !currentUser) return;
    const lastMsg = messages[messages.length - 1];

    messages.forEach((msg) => {
      // 排除自己剛發出的最後一則訊息
      const isSelfLastMsg = msg.id === lastMsg?.id && msg.sender === currentUser;

      if (msg.sender !== currentUser && !isSelfLastMsg) {
        fetch(`http://localhost:8081/messages/${msg.id}/markread`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    });
    // fetchReads()
    // 延遲一點點時間讓資料寫入 DB，再 fetch reads
    // setTimeout(() => {
    //   fetchReads();
    // }, 300); // 300ms 實測穩定足夠
  }, [messages, currentUser, token]);
//////////////////////////////////////

  const handleSend = async () => {
    const parsedRoomId = parseInt(roomId as string);
    if (!message.trim() || !token || isNaN(parsedRoomId)) return;

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

    // setMessages([...messages, { content: message, sender: currentUser || "me" }]);
    setMessage("");
    // 重新拉訊息,之前的取值沒有id，所以要fetch
    // const res = await fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
    //   headers: { Authorization: `Bearer ${token}` },
    // });
    // const data = await res.json();
    // setMessages(data.messages || []);
  };

  const handleLeaveGroup = async () => {
    if (!roomId || !token) return;
    const res = await fetch(`http://localhost:8081/rooms/${roomId}/leave`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      alert("退室しました");
      router.push("/chatroom");
    } else {
      alert("退室失敗しました");
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="relative bg-white p-4 border-b shadow-sm h-20 flex items-center justify-center" style={{ backgroundColor: "#f5fffa" }}>
        {systemMessage && (
          <div className="absolute left-1/2 transform -translate-x-1/2 top-full mt-2 bg-[#2e8b57] text-white px-4 py-2 rounded shadow-md text-sm z-20 transition-opacity duration-300">
            {systemMessage}
          </div>
        )}
        <h2 className="text-lg text-[#2e8b57] font-semibold">{roomTitle} (ID: {roomId})</h2>
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
              <button onClick={handleLeaveGroup} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-500">退室します</button>
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

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/5 bg-[#2e8b57] text-white p-4 overflow-y-auto">
          <h3 className="text-md font-semibold mb-4 text-center">メンバー</h3>
          <ul className="space-y-3">
            {members.map((name, idx) => (
              <li key={idx} className="bg-white text-[#2e8b57] rounded px-3 py-2 text-sm text-center">
                {name}
              </li>
            ))}
          </ul>
        </div>
        

        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg) => {
              const readers = messageReads[msg.id] || [];
              const isSender = msg.sender === currentUser;
              return (
                <div key={msg.id} className={`flex ${isSender ? "justify-end" : "justify-start"}`}>
                  <div className={`p-2 rounded-lg max-w-xs ${isSender ? "bg-blue-500" : "bg-green-700"} text-white`}>
                    <div className="text-xs font-semibold mb-1">{msg.sender}</div>
                    <div>{msg.content}</div>
                    <div className="text-[10px] mt-1 text-right">
                      {readers.length === 0
                        ? "未読"
                        : `既読 ${readers.length}人: ${readers.join(", ")}`}
                    </div>

                    {/* <div className="text-[10px] mt-1 text-right">
                      {readers.length === 0 ? "未読" : `已読 ${readers.length}人`}
                    </div> */}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>


{/*           
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === currentUser ? "justify-end" : "justify-start"}`}>
                <div className={`p-2 rounded-lg max-w-xs ${msg.sender === currentUser ? "bg-blue-500 text-white" : "bg-green-700 text-white"}`}>
                  <div className="text-xs font-semibold mb-1">{msg.sender}</div>
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div> */}

          <div className="p-4 border-t flex items-center bg-white">
            <input
              type="text"
              placeholder="メッセージを入力..."
              className="flex-1 border rounded px-3 py-2 mr-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSend();
                }
              }}
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