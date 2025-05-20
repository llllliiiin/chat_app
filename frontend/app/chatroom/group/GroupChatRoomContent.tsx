"use client";
import { useParams, useRouter,useSearchParams } from "next/navigation";
import { useEffect, useState, useRef} from "react";
///在 app/ router 中，useSearchParams() 是一個 只能在 client 元件使用的 Hook，並且必須包在 <Suspense> 裡面使用，否則在 prerender 階段就會報錯（就像你現在看到的情況）。



export default function GroupChatRoomContent() {
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


  useEffect(() => {
    const current = sessionStorage.getItem("currentUser");
    const tk = sessionStorage.getItem("token");
    ////////////////////////////////////////////

///////////////////////////////////////////////



    if (!current || !tk) {
      router.push("/login");
      return;
    }
    setCurrentUser(current);
    setToken(tk);
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
  useEffect(() => {
    if (!token || !roomId) return;

    fetch(`http://localhost:8081/rooms/${roomId}/enter`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }, [roomId, token]);
  /////////////////websocket
    useEffect(() => {
    if (!roomId) return;

    const ws = new WebSocket(`ws://localhost:8081/ws?room_id=${roomId}`);

    ws.onmessage = (event) => {
      ///將 JSON 格式的字串「解析」（parse）成 JavaScript 物件。
      const parsed = JSON.parse(event.data);

      if (parsed.type === "new_message" && parsed.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: parsed.message.id ?? Date.now(),
            content: parsed.message.content,
            sender: parsed.message.sender,
          }
        ]);
      }
    };

    ws.onopen = () => {
      console.log("✅ WebSocket 連線成功");
    };
    //因爲hotreloading的原因，會在上一個websocket尚未鏈接的時候被取消，只是開發的問題，吧這個error屏蔽掉就可以了
    
    ws.onerror = (event) => {
      console.error("❌ WebSocket 錯誤", event);

      // 如果你真的要檢查 message，應該這樣做：
      if ("message" in event && typeof (event as any).message === "string") {
        const msg = (event as any).message;
        if (msg.includes("closed before")) return;
        console.error("🚨 詳細錯誤", msg);
      }
};
    // ws.onerror = (event) => {
    //   const maybeError = event as unknown as { message?: string };
    //   if (maybeError.message?.includes("closed before")) return;
    //   console.error("❌ WebSocket 錯誤", event);
    // };

    ws.onclose = () => {
      console.log("🔌 WebSocket 已關閉");
    };

    return () => ws.close(); // 清理
  }, [roomId]);
//////////////////////////////

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
        });
      }
    });




////////////////////////////////
    const fetchReads = async () => {
      ////定義一個以 K 為 key、V 為 value 的對應表（map 或 dictionary）。
      const result: Record<number, string[]> = {};
      for (const msg of messages) {
        const res = await fetch(`http://localhost:8081/messages/${msg.id}/readers`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        result[msg.id] = data.readers || [];
      }
      setMessageReads(result);
    };

    fetchReads();
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
    const res = await fetch(`http://localhost:8081/messages?room_id=${roomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setMessages(data.messages || []);
  };

  const handleLeaveGroup = async () => {
    if (!roomId || !token) return;
    const res = await fetch(`http://localhost:8081/rooms/${roomId}/leave`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      alert("您已退出群組");
      router.push("/chatroom");
    } else {
      alert("退出失敗");
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="relative bg-white p-4 border-b shadow-sm h-20 flex items-center justify-center" style={{ backgroundColor: "#f5fffa" }}>
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
              <button onClick={handleLeaveGroup} className="block w-full text-left px-4 py-2 hover:bg-gray-100 text-sm text-red-500">退出群組</button>
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
          <h3 className="text-md font-semibold mb-4 text-center">👥 成員</h3>
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
                        : `已読 ${readers.length}人: ${readers.join(", ")}`}
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
