package handlers

import (
	"log"
	"net/http"
	"strconv"
	"sync"

	"github.com/gorilla/websocket"
)

// Clients: 一個 map，Key 是房間 ID（int），Value 是所有連線（conn）組成的集合（map[*websocket.Conn]bool）。
// Register: channel，用來註冊（新增）用戶連線。
// Unregister: channel，用來取消註冊（刪除）用戶連線。
// Broadcast: channel，傳送一個消息給同一房間的所有連線。
// Mutex: 鎖，用來確保多執行緒對 Clients 的存取安全
type WebSocketHub struct {
	Clients    map[int]map[*websocket.Conn]bool // roomID -> set of conns
	Register   chan ClientConn
	Unregister chan ClientConn
	Broadcast  chan WSMessage
	Mutex      sync.Mutex
}

type ClientConn struct {
	RoomID int
	Conn   *websocket.Conn
}

type WSMessage struct {
	RoomID int            `json:"room_id"`
	Data   map[string]any `json:"data"`
}

// //你需要從原本的 HTTP 連線「升級（Upgrade）」成 WebSocket 連線。
var Upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func NewHub() *WebSocketHub {
	return &WebSocketHub{
		Clients:    make(map[int]map[*websocket.Conn]bool),
		Register:   make(chan ClientConn),
		Unregister: make(chan ClientConn),
		Broadcast:  make(chan WSMessage),
	}
}

// /Run() 函數會在主程式中執行，用來持續處理所有註冊、註銷、廣播等事件。透過 select 不斷監聽三個 channel。
func (hub *WebSocketHub) Run() {
	for {
		select {
		//從register中取得資料，注冊使用者，將連線加入該房間的連線清單。先加鎖，最後解鎖
		case client := <-hub.Register:
			hub.Mutex.Lock()
			if hub.Clients[client.RoomID] == nil {
				hub.Clients[client.RoomID] = make(map[*websocket.Conn]bool)
			}
			hub.Clients[client.RoomID][client.Conn] = true
			hub.Mutex.Unlock()
			///使用者離開或者連綫失敗
		case client := <-hub.Unregister:
			hub.Mutex.Lock()
			if conns, ok := hub.Clients[client.RoomID]; ok {
				delete(conns, client.Conn)
				client.Conn.Close()
			}
			hub.Mutex.Unlock()
			///廣播信息
		case msg := <-hub.Broadcast:
			hub.Mutex.Lock()
			for conn := range hub.Clients[msg.RoomID] {
				if err := conn.WriteJSON(msg.Data); err != nil {
					log.Println("🔴 寫入 WebSocket 失敗:", err)
					conn.Close()
					delete(hub.Clients[msg.RoomID], conn)
				}
			}
			hub.Mutex.Unlock()
		}
	}
}

func (s *Server) WebSocketHandler(hub *WebSocketHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		roomID, _ := strconv.Atoi(r.URL.Query().Get("room_id"))
		conn, err := Upgrader.Upgrade(w, r, nil) //將 HTTP 轉成 WebSocket 連線。
		if err != nil {
			log.Println("❌ WebSocket 升級失敗:", err)
			return
		}
		///// 註冊使用者進入 hub，建立一個 ClientConn，並傳入 hub 的註冊 channel。
		client := ClientConn{RoomID: roomID, Conn: conn}
		hub.Register <- client
		/////持續讀取信息
		for {
			var dummy map[string]any
			if err := conn.ReadJSON(&dummy); err != nil {
				hub.Unregister <- client
				break
			}
		}
	}
}
