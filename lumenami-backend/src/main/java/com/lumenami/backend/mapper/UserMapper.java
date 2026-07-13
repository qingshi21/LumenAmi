package com.lumenami.backend.mapper;

import com.lumenami.backend.model.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper {
    User findByUsername(String username);
    void insert(User user);
    void updatePassword(@org.apache.ibatis.annotations.Param("id") Integer id, @org.apache.ibatis.annotations.Param("password") String password);
}