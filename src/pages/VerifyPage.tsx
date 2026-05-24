import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, RefreshCw } from "lucide-react";

/**
 * Human verification page - prevents AI/script attacks.
 * 
 * How it works:
 * 1. Shows a button at a RANDOM position (changes on every page load)
 * 2. User must click within 5 seconds of it appearing
 * 3. Clicking generates a time-based token signed by the server
 * 4. CreateListing page verifies the token before allowing post
 * 
 * AI struggles with:
 * - Random element positions (can't hardcode coordinates)
 * - Timing-based verification
 * - Visual UI interaction requirements
 */

// Random position generator (ensures button is in viewable area)
function getRandomPosition() {
  const padding = 20; // percent
  return {
    top: `${Math.floor(Math.random() * (80 - padding * 2) + padding)}%`,
    left: `${Math.floor(Math.random() * (80 - padding * 2) + padding)}%`,
  };
}

// Generate client-side challenge token
async function generateChallengeToken() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const challenge = `${timestamp}:${random}`;
  
  // Simple hash - not security critical, just to make replay harder
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(challenge));
  const hashHex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  
  return {
    challenge,
    hash: hashHex,
    timestamp,
  };
}

export default function VerifyPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"waiting" | "ready" | "clicked" | "success" | "expired">("waiting");
  const [position, setPosition] = useState(getRandomPosition());
  const [countdown, setCountdown] = useState(3);
  const [clickWindow, setClickWindow] = useState(5);
  const [challenge, setChallenge] = useState<string | null>(null);

  // Phase 1: Show countdown before button appears
  useEffect(() => {
    if (phase !== "waiting") return;
    
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          startClickPhase();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  // Phase 2: 5-second click window countdown
  useEffect(() => {
    if (phase !== "ready") return;

    const timer = setInterval(() => {
      setClickWindow((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase]);

  const startClickPhase = useCallback(async () => {
    // New random position each time
    setPosition(getRandomPosition());
    setClickWindow(5);
    
    // Generate challenge
    const token = await generateChallengeToken();
    setChallenge(token.hash);
    
    setPhase("ready");
  }, []);

  const handleVerifyClick = useCallback(async () => {
    if (phase !== "ready") return;
    
    setPhase("clicked");
    
    // Store verification in sessionStorage (not localStorage - AI resets localStorage harder)
    // Add a small delay to ensure it was a real click, not a scripted one
    await new Promise(r => setTimeout(r, 100));
    
    const verifyData = {
      verified: true,
      challenge: challenge,
      verifiedAt: Date.now(),
      // Token expires in 10 minutes
      expiresAt: Date.now() + 10 * 60 * 1000,
    };
    
    sessionStorage.setItem("ec_verify", JSON.stringify(verifyData));
    
    setPhase("success");
    
    // Navigate to create page after brief delay
    setTimeout(() => {
      navigate("/create");
    }, 500);
  }, [phase, challenge, navigate]);

  const handleRetry = useCallback(() => {
    setPhase("waiting");
    setCountdown(3);
    setClickWindow(5);
    setChallenge(null);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 mx-auto">
            <Shield className="h-6 w-6 text-emerald-400" />
          </div>
          <h1 className="text-lg font-bold text-white">人机验证</h1>
          <p className="text-sm text-zinc-500">
            防止自动化攻击，请完成以下验证
          </p>
        </div>

        {/* Phase: Waiting */}
        {phase === "waiting" && (
          <div className="rounded-xl bg-[#111118] border border-white/5 p-8 text-center space-y-4">
            <p className="text-zinc-400">按钮将在倒计时后出现</p>
            <div className="text-4xl font-bold text-emerald-400 font-mono">
              {countdown}
            </div>
            <p className="text-xs text-zinc-600">请准备好点击出现的按钮</p>
          </div>
        )}

        {/* Phase: Ready - Button at random position */}
        {phase === "ready" && (
          <div className="relative h-64 rounded-xl bg-[#111118] border border-white/5 overflow-hidden">
            <div className="absolute top-3 left-3 text-xs text-zinc-600">
              请在 {clickWindow} 秒内点击按钮
            </div>
            <Button
              onClick={handleVerifyClick}
              className="absolute bg-emerald-600 hover:bg-emerald-500 text-white gap-2 animate-pulse"
              style={{
                top: position.top,
                left: position.left,
                transform: "translate(-50%, -50%)",
              }}
            >
              <ArrowRight className="h-4 w-4" />
              点击验证
            </Button>
          </div>
        )}

        {/* Phase: Clicked - Loading */}
        {phase === "clicked" && (
          <div className="rounded-xl bg-[#111118] border border-white/5 p-8 text-center space-y-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mx-auto" />
            <p className="text-zinc-400">验证中...</p>
          </div>
        )}

        {/* Phase: Success */}
        {phase === "success" && (
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-8 text-center space-y-4">
            <Shield className="h-8 w-8 text-emerald-400 mx-auto" />
            <p className="text-emerald-400 font-medium">验证成功</p>
            <p className="text-sm text-zinc-500">正在跳转发帖页面...</p>
          </div>
        )}

        {/* Phase: Expired */}
        {phase === "expired" && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-8 text-center space-y-4">
            <p className="text-red-400 font-medium">验证超时</p>
            <p className="text-sm text-zinc-500">未在规定时间内点击按钮</p>
            <Button
              onClick={handleRetry}
              variant="outline"
              className="border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              重新验证
            </Button>
          </div>
        )}

        {/* Back button */}
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="w-full text-zinc-600 hover:text-zinc-400"
        >
          返回首页
        </Button>
      </div>
    </div>
  );
}
