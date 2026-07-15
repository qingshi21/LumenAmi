package com.lumenami.backend.service;

/**
 * 网络搜索服务接口
 */
public interface WebSearchService {

    /**
     * 搜索角色的公开信息
     * @param roleName 角色名称
     * @return 搜索结果（可能为空）
     */
    String searchCharacterInfo(String roleName);
}
