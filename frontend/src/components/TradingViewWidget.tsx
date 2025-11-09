'use client';

import { useEffect, useRef, memo } from "react";

interface TradingViewWidgetProps {
  symbol: string;
  theme?: "light" | "dark";
  fullscreen?: boolean;
  showSideToolbar?: boolean;
}

function TradingViewWidget({
  symbol,
  theme = "light",
  fullscreen = false,
  showSideToolbar = false,
}: TradingViewWidgetProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('[TradingViewWidget] Rendering widget')
    console.log('[TradingViewWidget] Props:', { symbol, theme, fullscreen })
    
    if (!container.current) {
      console.log('[TradingViewWidget] Container ref not available')
      return;
    }
    
    console.log('[TradingViewWidget] Clearing container and creating widget')
    container.current.innerHTML = "";

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol,
      interval: "1", 
      theme,
      style: "1",
      hide_top_toolbar: fullscreen ? false : true,
      hide_side_toolbar: showSideToolbar ? false : true, 
      hide_compare_symbol: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      locale: "en",
      backgroundColor:
        theme === "dark" ? "rgba(0,0,0,1)" : "rgba(255,255,255,1)",
      support_host: "https://www.tradingview.com",
      enable_publishing: false,
      withdateranges: false,
    });

    const widgetContainer = document.createElement("div");
    widgetContainer.className = "tradingview-widget-container__widget";
    widgetContainer.style.height = "100%";
    widgetContainer.style.width = "100%";

    console.log('[TradingViewWidget] Appending widget to container')
    container.current.appendChild(widgetContainer);
    container.current.appendChild(script);
    
    console.log('[TradingViewWidget] Widget setup complete')

    return () => {
      console.log('[TradingViewWidget] Cleaning up widget')
      if (container.current) container.current.innerHTML = "";
    };
  }, [symbol, theme, fullscreen, showSideToolbar]);

  console.log('[TradingViewWidget] Rendering container with style:', { 
    height: fullscreen ? "100%" : "500px", 
    width: "100%",
    fullscreen 
  })

  return (
    <div
      className="tradingview-widget-container"
      ref={container}
      style={{ 
        height: fullscreen ? "100%" : "500px", 
        width: "100%",
        margin: 0,
        padding: 0
      }}
    />
  );
}

export default memo(TradingViewWidget);
