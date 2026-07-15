package com.lumenami.backend.service.impl;

import com.lumenami.backend.service.WebSearchService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * 网络搜索服务实现（使用 DuckDuckGo Instant Answer API，免费无需 API Key）
 */
@Slf4j
@Service
public class WebSearchServiceImpl implements WebSearchService {

    @Override
    public String searchCharacterInfo(String roleName) {
        if (roleName == null || roleName.trim().isEmpty()) {
            return null;
        }

        try {
            // 使用 DuckDuckGo Instant Answer API（免费，无需 key）
            String query = URLEncoder.encode(roleName + " character personality anime game", StandardCharsets.UTF_8);
            String urlStr = "https://api.duckduckgo.com/?q=" + query + "&format=json&no_html=1&skip_disambig=1";

            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                log.warn("DuckDuckGo API 返回错误码: {}", responseCode);
                return null;
            }

            BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = in.readLine()) != null) {
                response.append(line);
            }
            in.close();

            String result = extractInfoFromJson(response.toString());
            if (result != null) {
                log.info("搜索角色 '{}' 成功，结果长度: {}", roleName, result.length());
            } else {
                log.info("搜索角色 '{}' 未找到有效信息", roleName);
            }
            return result;

        } catch (Exception e) {
            log.error("搜索角色信息失败: roleName={}", roleName, e);
            return null;
        }
    }

    /**
     * 从 DuckDuckGo JSON 响应中提取角色信息
     */
    private String extractInfoFromJson(String json) {
        StringBuilder info = new StringBuilder();

        // 1. 提取 Abstract（百科摘要）
        String abstractText = extractJsonValue(json, "AbstractText");
        if (abstractText != null && !abstractText.trim().isEmpty()) {
            info.append(abstractText.trim());
        }

        // 2. 提取 Answer（直接答案）
        String answer = extractJsonValue(json, "Answer");
        if (answer != null && !answer.trim().isEmpty() && !info.toString().contains(answer)) {
            if (info.length() > 0) info.append("\n");
            info.append(answer.trim());
        }

        // 3. 提取 RelatedTopics 中的前几个结果
        // 简单提取 Definition 字段
        int pos = 0;
        int count = 0;
        while (count < 3) {
            int defIdx = json.indexOf("\"Text\"", pos);
            if (defIdx == -1) break;

            int colonIdx = json.indexOf(":", defIdx);
            if (colonIdx == -1) break;

            int startQuote = json.indexOf("\"", colonIdx);
            if (startQuote == -1) break;

            int endQuote = findEndQuote(json, startQuote + 1);
            if (endQuote == -1) break;

            String text = json.substring(startQuote + 1, endQuote)
                    .replace("\\n", " ")
                    .replace("\\\"", "\"");

            if (!text.isEmpty() && !info.toString().contains(text)) {
                if (info.length() > 0) info.append("\n");
                info.append(text);
                count++;
            }

            pos = endQuote + 1;
        }

        return info.length() > 0 ? info.toString() : null;
    }

    /**
     * 从 JSON 中提取指定 key 的字符串值
     */
    private String extractJsonValue(String json, String key) {
        String searchKey = "\"" + key + "\"";
        int keyIdx = json.indexOf(searchKey);
        if (keyIdx == -1) return null;

        int colonIdx = json.indexOf(":", keyIdx + searchKey.length());
        if (colonIdx == -1) return null;

        // 跳过空白
        int pos = colonIdx + 1;
        while (pos < json.length() && Character.isWhitespace(json.charAt(pos))) pos++;

        if (pos >= json.length()) return null;

        // 如果是字符串值
        if (json.charAt(pos) == '"') {
            int endQuote = findEndQuote(json, pos + 1);
            if (endQuote == -1) return null;
            return json.substring(pos + 1, endQuote)
                    .replace("\\n", " ")
                    .replace("\\\"", "\"");
        }

        return null;
    }

    private int findEndQuote(String json, int start) {
        for (int i = start; i < json.length(); i++) {
            if (json.charAt(i) == '"' && json.charAt(i - 1) != '\\') {
                return i;
            }
        }
        return -1;
    }
}
