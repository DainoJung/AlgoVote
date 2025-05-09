import { NextRequest, NextResponse } from 'next/server';

// 백엔드 URL을 환경 변수로 설정 (기본값으로 배포된 백엔드 URL 사용)
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://algovote.onrender.com';

// 타임아웃 설정을 위한 함수 - 타임아웃 기본값 늘림 (60초)
const fetchWithTimeout = async (url: string, options: RequestInit, timeout = 60000) => {
  const controller = new AbortController();
  const { signal } = controller;
  
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    // 요청 시작 시간 로깅
    console.log(`API 요청 시작: ${new Date().toISOString()}`);
    
    const response = await fetch(url, { ...options, signal });
    clearTimeout(timeoutId);
    
    // 요청 종료 시간 로깅
    console.log(`API 요청 완료: ${new Date().toISOString()}`);
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    console.error(`API 요청 오류: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { question, match_count } = body;

    console.log(`Sending request to backend: ${BACKEND_URL}/api/question`);
    console.log(`질문 내용: "${question}"`);

    // 백엔드 서버가 콜드 스타트될 수 있으므로 먼저 헬스체크
    // ESLint 경고 방지를 위해 error 변수 사용 안함
    try {
      console.log('백엔드 서버 상태 확인 중...');
      const healthCheck = await fetch(`${BACKEND_URL}/health`, { 
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (healthCheck.ok) {
        console.log('백엔드 서버 준비 완료');
      } else {
        console.log('백엔드 서버 헬스체크 실패, 계속 진행합니다');
      }
    } catch {
      console.log('백엔드 서버 상태 확인 오류, 계속 진행합니다');
    }

    // 백엔드 API 호출 (타임아웃 60초 설정)
    const response = await fetchWithTimeout(
      `${BACKEND_URL}/api/question`, 
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': process.env.NEXT_PUBLIC_SITE_URL || 'https://www.algovote.info',
        },
        body: JSON.stringify({
          question,
          match_count,
          candidate_ids: body.candidate_ids || [],
        }),
        cache: 'no-store'
      },
      60000 // 60초 타임아웃
    );

    // 백엔드 서버에서 508 오류 발생 시 예외 처리
    if (response.status === 508) {
      console.log('Backend returned 508 Loop Detected error');
      return NextResponse.json(
        { 
          answer: "죄송합니다. 요청 처리 중 서버 오류가 발생했습니다. 요청량이 너무 많거나 서버 부하가 높을 수 있습니다. 잠시 후 다시 시도해주세요." 
        },
        { status: 200 }
      );
    }

    // 504 Gateway Timeout 오류 처리
    if (response.status === 504) {
      console.log('Backend returned 504 Gateway Timeout error');
      return NextResponse.json(
        { 
          answer: "죄송합니다. 백엔드 서버 응답 시간이 초과되었습니다. 서버가 잠시 휴면 상태에서 깨어나는 중일 수 있습니다. 30초 후 다시 시도해주세요." 
        },
        { status: 200 }
      );
    }

    if (!response.ok) {
      console.error(`Backend API responded with status: ${response.status}`);
      throw new Error(`Backend API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('API 요청 처리 중 오류 발생:', error);
    
    // AbortError (타임아웃) 처리
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { 
          answer: "죄송합니다. 요청 시간이 초과되었습니다. 백엔드 서버가 현재 혼잡하거나 휴면 상태에서 깨어나는 중일 수 있습니다. 30초 후 다시 시도해주세요." 
        },
        { status: 200 }
      );
    }
    
    return NextResponse.json(
      { 
        answer: "죄송합니다. 요청을 처리하는 중에 오류가 발생했습니다. 잠시 후 다시 시도해주세요." 
      },
      { status: 200 } // 클라이언트에게는 200 상태 코드 반환 (오류 메시지 포함)
    );
  }
} 