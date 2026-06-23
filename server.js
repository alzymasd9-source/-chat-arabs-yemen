const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let usersDatabase = {
    "المسافر": { role: "عضو", coins: 500 },
    "صنعاني أنيق": { role: "مشرف", coins: 1200 },
    "شبل اليمن": { role: "VIP", coins: 3500 },
    "ملكة سبأ": { role: "عضو", coins: 150 }
};

// حفظ اتصالات غرف الصوت الحية
let activeAudioUsers = {}; 

io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);

    socket.on('user_logged_in', (username) => {
        if (!usersDatabase[username]) {
            usersDatabase[username] = { role: "عضو", coins: 100 };
        }
        socket.username = username;
        activeAudioUsers[socket.id] = { username: username };

        socket.emit('update_my_balance', {
            coins: usersDatabase[username].coins,
            role: usersDatabase[username].role
        });

        // إعلام المستخدمين الجدد بمن يتواجد حالياً في الغرفة الصوتية
        socket.emit('all_audio_users', activeAudioUsers);
    });

    // 1. نظام إرسال واستقبال إشارات الصوت (WebRTC Signaling)
    socket.on('audio_offer', (data) => {
        io.to(data.target).emit('audio_offer', {
            sdp: data.sdp,
            sender: socket.id,
            username: socket.username
        });
    });

    socket.on('audio_answer', (data) => {
        io.to(data.target).emit('audio_answer', {
            sdp: data.sdp,
            sender: socket.id
        });
    });

    socket.on('ice_candidate', (data) => {
        io.to(data.target).emit('ice_candidate', {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    // 2. معالجة الرسائل النصية المعتادة
    socket.on('send_chat_message', (messageData) => {
        const user = usersDatabase[messageData.username] || { role: "عضو" };
        const formattedData = {
            username: messageData.username,
            text: messageData.text,
            role: user.role,
            time: new Date().toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit', hour12: false })
        };
        io.emit('receive_chat_message', formattedData);
    });

    // 3. نظام إرسال الهدايا والعملات
    socket.on('send_gift_coins', (data) => {
        const sender = socket.username;
        const receiver = data.receiver;
        const amount = parseInt(data.amount);

        if (!usersDatabase[sender] || !usersDatabase[receiver] || usersDatabase[sender].coins < amount || amount <= 0) {
            socket.emit('gift_error', 'فشلت عملية إرسال الهدايا، تحقق من الرصيد أو الاسم!');
            return;
        }

        usersDatabase[sender].coins -= amount;
        usersDatabase[receiver].coins += amount;

        io.emit('gift_broadcast', {
            sender: sender,
            receiver: receiver,
            amount: amount,
            text: `قام ${sender} بإهداء ${amount} عملة ذهبية إلى ${receiver} 🎉🌟`
        });

        io.sockets.emit('force_balance_refresh', usersDatabase);
    });

    socket.on('disconnect', () => {
        delete activeAudioUsers[socket.id];
        io.emit('user_left_audio', socket.id);
        console.log('مستخدم غادر:', socket.id);
    });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
          
