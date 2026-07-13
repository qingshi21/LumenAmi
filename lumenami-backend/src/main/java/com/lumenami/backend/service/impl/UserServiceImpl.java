package com.lumenami.backend.service.impl;

import com.lumenami.backend.config.JwtUtil;
import com.lumenami.backend.dto.LoginRequest;
import com.lumenami.backend.dto.LoginResponse;
import com.lumenami.backend.dto.RegisterRequest;
import com.lumenami.backend.exception.BusinessException;
import com.lumenami.backend.mapper.UserMapper;
import com.lumenami.backend.model.User;
import com.lumenami.backend.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * 用户服务实现类
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserMapper userMapper;
    private final JwtUtil jwtUtil;
    private static final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Override
    public void register(RegisterRequest request) {
        log.info("用户注册请求: username={}", request.getUsername());
        
        if (request.getUsername() == null || request.getUsername().trim().isEmpty()) {
            throw new BusinessException(400, "用户名不能为空");
        }
        if (request.getPassword() == null || request.getPassword().length() < 6) {
            throw new BusinessException(400, "密码不能少于6位");
        }
        if (userMapper.findByUsername(request.getUsername()) != null) {
            log.warn("用户注册失败，用户名已存在: username={}", request.getUsername());
            throw new BusinessException(400, "用户名已存在");
        }

        User user = new User();
        user.setUsername(request.getUsername());
        // BCrypt 加密密码
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        userMapper.insert(user);
        
        log.info("用户注册成功: userId={}, username={}", user.getId(), user.getUsername());
    }

    @Override
    public LoginResponse login(LoginRequest request) {
        log.info("用户登录请求: username={}", request.getUsername());
        
        User user = userMapper.findByUsername(request.getUsername());
        if (user == null) {
            log.warn("用户登录失败，用户不存在: username={}", request.getUsername());
            throw new BusinessException(401, "用户名或密码错误");
        }

        boolean passwordMatch = false;
        String storedPassword = user.getPassword();

        // 判断是否是 BCrypt 格式（以 $2a$ 或 $2b$ 开头）
        if (storedPassword != null && storedPassword.startsWith("$2")) {
            // BCrypt 加密过的密码
            passwordMatch = passwordEncoder.matches(request.getPassword(), storedPassword);
        } else {
            // 明文密码（旧数据兼容），直接比较
            passwordMatch = request.getPassword().equals(storedPassword);
            if (passwordMatch) {
                // 登录成功，自动升级为 BCrypt 加密
                log.info("检测到明文密码，自动升级为 BCrypt: userId={}", user.getId());
                user.setPassword(passwordEncoder.encode(request.getPassword()));
                userMapper.updatePassword(user.getId(), user.getPassword());
            }
        }

        if (!passwordMatch) {
            log.warn("用户登录失败，密码错误: username={}", request.getUsername());
            throw new BusinessException(401, "用户名或密码错误");
        }

        // 生成 JWT token
        String token = jwtUtil.generateToken(user.getId(), user.getUsername());

        LoginResponse resp = new LoginResponse();
        resp.setUserId(user.getId());
        resp.setUsername(user.getUsername());
        resp.setToken(token);
        
        log.info("用户登录成功: userId={}, username={}", user.getId(), user.getUsername());
        return resp;
    }
}
