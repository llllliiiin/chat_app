import Image from "next/image";
import Link from 'next/link';
import './globals.css';
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col bg-gray-50">
      {/* 顶部导航栏
      <header className="bg-white shadow p-4">
        <nav className="container mx-auto flex justify-between items-center">
          <div className="text-lg font-bold text-[#2e8b57]">LINECHAT</div>
          <div className="space-x-4">
            <Link href="/" className="text-gray-700 hover:text-[#2e8b57]">首页</Link>
            <Link href="/about" className="text-gray-700 hover:text-[#2e8b57]">关于</Link>
          </div>
        </nav>
      </header> */}

      {/* 主内容 */}
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white p-10 rounded-2xl shadow-lg w-full max-w-md flex flex-col items-center space-y-6">
          <p className="text-2xl font-bold text-[#2e8b57] text-center">WELCOME TO LINECHAT</p>

          <Link
            href="/signup"
            className="w-full px-6 py-2 bg-[#2e8b57] text-white rounded hover:bg-green-700 transition text-center"
          >
            サインアップ
          </Link>
          <Link
            href="/login"
            className="w-full px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-center"
          >
            ログイン
          </Link>
        </div>
      </div>

      {/* 页脚 */}
      {/* <footer className="bg-white text-center text-gray-500 py-4 text-sm border-t">
        &copy; 2025 我的Web应用
      </footer> */}
    </main>

    // <main>
    //   <header>
    //     <nav>
    //       <Link href="/">首页</Link> | <Link href="/about">关于</Link>
    //     </nav>
    //   </header>
    //   <div className="h-screen flex items-center justify-center bg-gray-50">
    //     <div className="bg-blue-100 p-8 rounded-lg shadow-lg w-96 flex flex-col items-center space-y-6">
    //       <p className="text-xl font-bold text-center">WELCOME TO LINECHAT</p>
    //       <Link
    //         href="/signup"
    //         className="w-64 px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-center"
    //       >
    //         サインアップ
    //       </Link>
    //       <Link
    //         href="/login"
    //         className="w-64 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-center"
    //       >
    //         ログイン
    //       </Link>
          
    //     </div>
    //   </div>
    //   <footer>
    //     &copy; 2025 我的Web应用
    //   </footer>
    // </main>
  );
}


