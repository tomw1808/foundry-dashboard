import { useEffect, useRef, useState, useCallback } from 'react';
import { RpcPayload, SignRequest, WsStatus } from '@/types'; // Import WsStatus from types

interface UseWebSocketManagerOptions {
    onRpcRequest: (requestId: string, payload: RpcPayload) => void;
    onSignRequestReceived: (request: SignRequest) => void;
}

export function useWebSocketManager({ onRpcRequest, onSignRequestReceived }: UseWebSocketManagerOptions) {
    const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');
    const wsRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        const wsUrl = `ws://${window.location.host}/socket`;
        console.log('[WSManager] Attempting to connect WebSocket to:', wsUrl);
        setWsStatus('connecting');
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log('[WSManager] WebSocket Connected');
            wsRef.current = socket;
            setWsStatus('open');
            // Send clientHello only if socket is truly open and current
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'clientHello', message: 'Frontend connected' }));
            }
        };

        socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data as string);
                if (message.type === 'rpcRequest') {
                    // console.log(`[WSManager] Received rpcRequest for method: ${message.payload?.method} (ID: ${message.requestId})`);
                    onRpcRequest(message.requestId, message.payload);
                } else if (message.type === 'signRequest') {
                    // console.log('[WSManager] Received signRequest:', message.requestId, message.payload?.method);
                    onSignRequestReceived({ requestId: message.requestId, payload: message.payload });
                }
            } catch (error) {
                console.error('[WSManager] Failed to parse WebSocket message:', error);
            }
        };

        socket.onerror = (error) => {
            console.error('[WSManager] WebSocket Error:', error);
            // wsRef.current = null; // Ref will be nulled in onclose or cleanup
            setWsStatus('error');
        };

        socket.onclose = () => {
            console.log('[WSManager] WebSocket Disconnected');
            wsRef.current = null;
            setWsStatus('closed');
        };

        return () => {
            if (socket) {
                console.log('[WSManager] Closing WebSocket');
                // Prevent further events by nullifying handlers before closing
                socket.onopen = null;
                socket.onmessage = null;
                socket.onerror = null;
                socket.onclose = null;
                if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
                    socket.close();
                }
            }
            wsRef.current = null; // Ensure ref is cleared on cleanup
        };
    }, [onRpcRequest, onSignRequestReceived]); // Dependencies for the effect

    const sendMessage = useCallback((messageString: string) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(messageString);
        } else {
            console.error(`[WSManager] WebSocket not open (state: ${wsRef.current?.readyState}), cannot send message.`);
        }
    }, []); // wsRef.current is managed by useEffect, sendMessage itself doesn't depend on its value changing

    return { wsStatus, sendMessage };
}
