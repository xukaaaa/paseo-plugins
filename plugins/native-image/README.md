# native-image

Hiển thị ảnh do Pi extension `native-image` lưu, với preview và phóng to trong chat. Không tạo ảnh.

## Cài đặt

Cần Paseo ≥0.10.3; daemon cần Git, Node.js và npm.

Dán source vào **Settings → Plugins**, bật **Enable plugins** và bấm **Install plugin**:

```text
github:xukaaaa/paseo-plugins:plugins/native-image
```

Hoặc chạy:

```bash
paseo plugin install github:xukaaaa/paseo-plugins:plugins/native-image
```

Cài Pi extension trên cùng host/user rồi mở session mới:

```bash
pi install git:github.com/xukaaaa/pi-extensions
```

Upstream phải tự cung cấp khả năng tạo ảnh. Pi và Paseo dùng chung thư mục ảnh mặc định `~/.pi/agent/native-image-artifacts`; nếu đặt `PI_NATIVE_IMAGE_DIR`, dùng cùng giá trị cho cả hai tiến trình.
