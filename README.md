# Paseo plugins

| Plugin | Mô tả |
| --- | --- |
| `paseo-tps` | Hiển thị tốc độ sinh văn bản ước lượng của Pi trong lúc stream và dưới câu trả lời đã hoàn tất. |
| `native-image` | Hiển thị ảnh do Pi extension `native-image` lưu, với preview và phóng to trong chat. Không tạo ảnh. |

## Cài đặt

Cần Paseo ≥0.10.3. Máy chạy daemon cần Git, Node.js và npm.

Trong **Settings → Plugins**, bật **Enable plugins**, dán từng source rồi bấm **Install plugin**:

```text
github:xukaaaa/paseo-plugins:plugins/paseo-tps
```

```text
github:xukaaaa/paseo-plugins:plugins/native-image
```

Hoặc chạy trên máy có daemon:

```bash
paseo plugin install github:xukaaaa/paseo-plugins:plugins/paseo-tps
paseo plugin install github:xukaaaa/paseo-plugins:plugins/native-image
```

Để dùng `native-image`, cài thêm Pi extension trên cùng host/user:

```bash
pi install git:github.com/xukaaaa/pi-extensions
```

Sau đó mở session Pi/Paseo mới. Pi và Paseo dùng chung thư mục ảnh mặc định `~/.pi/agent/native-image-artifacts`; nếu đổi `PI_NATIVE_IMAGE_DIR`, đặt cùng giá trị cho cả hai tiến trình. Upstream phải tự cung cấp khả năng tạo ảnh.
