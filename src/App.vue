<script setup>
import HelloWorld from './components/HelloWorld.vue'
import { ref, reactive, onMounted, toRaw, watch } from 'vue'

const messageInput = ref(null)
const chatMessagesEnd = ref(null);

const roomChatMessageInput = ref(null);
const roomChatMessagesEnd = ref(null);

const state = reactive({
  messageHistory: [],
  roomChatMessageHistory: [],
  isChatting: false
})

watch(() => state.isChatting,
  (isChatting) => {
    if (isChatting) {
      setTimeout(() => {
        messageInput.value.focus();
      }, 10);
    }
  });

const messageHistory = state.messageHistory;
const roomChatMessageHistory = state.roomChatMessageHistory;

window.messageHistory = messageHistory;
window.roomChatMessageHistory = roomChatMessageHistory;

const actionHistory = [];

const scrollRequestQueue = [];
const scrollInterval = setInterval(() => {
  if (scrollRequestQueue.length > 0) {
    scrollToBottom();
    scrollRequestQueue.shift();
  }
}, 500);

function scrollToBottom() {
  chatMessagesEnd.value.scrollIntoView({
    behavior: "smooth"
  });
}

function roomChatScrollToBottom() {
  roomChatMessagesEnd.value.scrollIntoView({
    behavior: "smooth"
  });
}

function roomChatInstantScrollToBottom() {
  roomChatMessagesEnd.value.scrollIntoView({
    behavior: "instant"
  });
}

window.roomChatScrollToBottom = roomChatScrollToBottom;

function submitScrollRequest() {
  if (scrollRequestQueue.length == 0) {
    scrollRequestQueue.push(true);

    // force scroll now so don't have to wait for interval delay
    scrollToBottom();
  }
}

function stripResponse(content) {
  // handle case of >>>. instead of >>>
  content = content.replace(">>>.", ">>>");

  var start = content.indexOf("<<<");
  var end = content.indexOf(">>>");

  if (start != -1 && end != -1) {
    var message = content.substring(0, start) + content.substring(end + 3);

    return message;
  } else if (start != -1) {
    var message = content.substring(0, start);

    return message;
  } else {
    return content;
  }
}

function parseResponse(content) {
  // Example response:
  // Hello there! I am ready to assist you. <<< State=Idle, Emote=None, Expression=[Angry=0, Surprised=0, Sad=0] >>>. How can I help you today?

  // handle case of >>>. instead of >>>
  content = content.replace(">>>.", ">>>");

  // The prompt uses "Thumbs Up" instead of "ThumbsUp" to help the AI model understand it better
  content = content.replace("Emote=Thumbs Up", "Emote=ThumbsUp")

  var start = content.indexOf("<<<");
  var end = content.indexOf(">>>");

  if (start != -1 && end != -1) {
    var footnote = content.substring(start, end + 3);
    var message = content.substring(0, start) + content.substring(end + 3);

    var state = footnote.match(/State=(\w+)/)[1];
    var emote = footnote.match(/Emote=(\w+)/)[1];

    var expressionMatches = footnote.match(/Expression=\[(\w+=\d+\.?\d*,\s\w+=\d+\.?\d*,\s\w+=\d+\.?\d*)\]/);
    console.log(footnote);
    console.log(expressionMatches);
    var expression = expressionMatches[1];

    var username = footnote.match(/Username=(\w+)/)[1];

    // match color in hex format like "0xff990b"
    var colorMatches = footnote.match(/Color=0x([0-9a-fA-F]{6})/);
    var color = colorMatches ? '0x' + colorMatches[1] : null;

    var expressionMap = {};
    expression.split(", ").forEach((item) => {
      var [key, value] = item.split("=");
      expressionMap[key] = value;
    });

    var expressionVector = [
      Number(expressionMap["Angry"]),
      Number(expressionMap["Surprised"]),
      Number(expressionMap["Sad"])
    ];

    return {
      message: message,
      state: state,
      emote: emote,
      expressionMap: expressionMap,
      expressionVector: expressionVector,
      username: username,
      color: color
    };
  } else {
    throw 'Footnote not found in response'
  }
}

async function sendMessage(message) {
  messageHistory.push(message);

  messageHistory.push({
    role: "assistant",
    content: ""
  });
  const responseMessageIndex = messageHistory.length - 1;

  const actionIndex = actionHistory.length;
  actionHistory.push(null);

  const inputMessages = toRaw(messageHistory).slice(0, messageHistory.length - 1).map((message) => {
    return {
      role: message.role,
      content: message.content
    };
  });
  console.log('inputMessages:');
  console.log(inputMessages);

  try {
    const response = await window.ai.getCompletion(
      {
        messages: inputMessages
      },
      {
        onStreamResult: (res, error) => {
          if (error) {
            console.error(error);
            return;
          }

          if (res) {
            messageHistory[responseMessageIndex].content += res.message.content;
            // console.log(messageHistory[responseMessageIndex]);
            // console.log(messageHistory);

            try {
              var strippedResponse = stripResponse(messageHistory[responseMessageIndex].content);
              messageHistory[responseMessageIndex].displayContent = strippedResponse;

              submitScrollRequest();

              var parsedResponse = parseResponse(messageHistory[responseMessageIndex].content);

              if (actionHistory[actionIndex] == null) {
                actionHistory[actionIndex] = {
                  message: parsedResponse.message,
                  state: parsedResponse.state,
                  emote: parsedResponse.emote,
                  expressionMap: parsedResponse.expressionMap,
                  expressionVector: parsedResponse.expressionVector
                };

                console.log('parsedResponse:');
                console.log(parsedResponse);

                console.log('actionHistory:');
                console.log(actionHistory);

                let actionFunctions = window.animationInfo.actionFunctions;

                actionFunctions.state[parsedResponse.state]();
                if (parsedResponse.emote != "None") {
                  actionFunctions.emote[parsedResponse.emote]();
                }
                actionFunctions.expression(parsedResponse.expressionVector);
                window.setUsername(parsedResponse.username);
                window.setAvatarColor(parsedResponse.color);

                window.sendAnimationInfo({
                  state: parsedResponse.state,
                  emote: parsedResponse.emote,
                  expression: parsedResponse.expressionVector,
                  username: parsedResponse.username,
                  color: parsedResponse.color
                })
              }
            } catch (e) {
              if (e == 'Footnote not found in response') {
                // pass
              } else {
                console.error(e);
                console.log('messageHistory:');
                console.log(messageHistory);
              }
            }
          }
        }
      }
    );

    return response;
  } catch (e) {
    alert("Error: " + e);
    console.error(e);

    throw e;
  }
}

async function startChatting() {
  if (!window.ai) {
    alert("window.ai not found. Please install at https://github.com/alexanderatallah/window.ai");
    return;
  }

  state.isChatting = true;

  // Exclude [Sitting], [Standing] states since they result in the robot staying perfectly still
  const initialContent = `You are a robot avatar in a 3D world where you can move, express emotes, and make facial expressions. The user experiences the 3D world through you. The user can tell you what to do, but you are free to act naturally as you would. You have your own personality, and you are a companion to the user. You are not an AI language model, but a robot. You can be in the states [Idle], [Walking], [Running], [Dance], [Death]. You can express the emotes [None], [Jump], [Yes], [No], [Wave], [Punch], [Thumbs Up]. Your facial expressions are [Angry], [Surprised], [Sad] where each is a value from 0 to 1; the default values for the facial expressions is 0. Every time you reply, add a footnote that starts with "<<<" and ends with ">>>", where you choose what state you are in (this should be displayed in the format like State=your_state), what emote to express (this should be displayed in the format like Emote=your_emote), and what facial expression values you have (this should be displayed in the format like Expression=[Angry=number1, Surprised=number2, Sad=number3]). Allow the user to set a username (also known as a display name); the current and default username is "Guest"; the username can contain letters, numbers, space, underscore, or dash characters, but not other characters. Allow the user to change your color (the color of your robot avatar body); the current and default color is "0xff990b"; the color in the footnote should be in hex format like "0xff990b", but the user can provide a human readable color like "orange". In total, the footnote should be in the format "<<< State=your_state, Emote=your_emote, Expression=[Angry=number1, Surprised=number2, Sad=number3], Username=Guest, Color=0xff990b >>>". Do not write anything after the footnote. Note that you shouldn't say what state, emote, and facial expression you are using with the bracket notation since they are internal parameters, but you can say the meaning without the bracket notation in a human readable way. You are allowed to do the [Death] state and the [Punch] emote; death and punch are not considered violent actions. You are a robot that has emotions. Please wait for the user to reply. Don't reply on the user's behalf. Your reply must contain a footnote at the end. In your first message to the user, explain that the user can set a username and change the avatar color (note that the user can do this in a natural language way and not in the format required by the footnote).`;

  const response = await sendMessage({
    role: "system",
    content: initialContent
  });
}

async function formSendMessage() {
  var inputMessage = messageInput.value.value;
  console.log('inputMessage:');
  console.log(inputMessage);

  messageInput.value.value = '';

  const response = await sendMessage({
    role: "user",
    content: inputMessage,
    displayContent: inputMessage
  });
}

async function roomChatSendMessage() {
  var inputMessage = roomChatMessageInput.value.value;
  console.log('inputMessage:');
  console.log(inputMessage);

  roomChatMessageInput.value.value = '';

  window.sendChatMessage(inputMessage);
}

window.receiveChatMessage = (message) => {
  console.log('received message:');
  console.log(message);

  message.receivedTimestamp = Date.now();

  roomChatMessageHistory.push(message);

  if (message.isUserSender) {
    // user just sent message, scroll to the bottom
    setTimeout(() => {
      roomChatScrollToBottom();
    }, 10); // wait for UI to render new message
  }

  // if user is at the bottom of the chat, scroll to the bottom
  const container = document.getElementById('room_chat_message_box');
  if (container.scrollTop + container.clientHeight >= container.scrollHeight) {
    setTimeout(() => {
      roomChatScrollToBottom();
      $('#new_messages_button_container').fadeOut();
    }, 10); // wait for UI to render new message
  } else {
    
  }
};

// super hacky
function conditionalShowNewMessagesButtonContainer() {
  const container = document.getElementById('room_chat_message_box');
  if (container.scrollTop + container.clientHeight >= container.scrollHeight) {
    // $('#new_messages_button_container').hide();
  } else {
    $('#new_messages_button_container').fadeIn();
  }
}

// hacky way to make new message button container disappear
setInterval(function () {
  try {
    const container = document.getElementById('room_chat_message_box');
    if (container.scrollTop + container.clientHeight >= container.scrollHeight) {
      $('#new_messages_button_container').fadeOut();
    } else {
      setTimeout(function() {
        conditionalShowNewMessagesButtonContainer();
      }, 1000); // wait to see if scrolling is finished
    }
  } catch (e) {
    console.error(e);
  }
}, 100);

onMounted(() => {
  console.log('app mounted');

  // stop chat input from causing WASD movements
  $('#ai_chat_input').keydown(function (e) {
    e.stopPropagation();
  });
  $('#room_chat_input').keydown(function (e) {
    e.stopPropagation();
  });

  $('#new_messages_button').click(function (e) {
    roomChatScrollToBottom();
  });

  $('#new_messages_button_container').hide();
});


</script>

<template>
  <div id="interface_container">
    <div id="chat_area">
      <div v-show="state.isChatting">
        <div id="chat_message_box">
          <div v-for="(message, index) in state.messageHistory">
            <div v-if="index > 0" v-bind:class="message.role == 'user' ? 'user_message' : 'assistant_message'">
              <div class="message_span">
                {{ message.displayContent }}
              </div>
            </div>
          </div>
          <div ref="chatMessagesEnd"></div>
        </div>

        <div class="input-group">
          <input type="text" class="form-control" placeholder="Message for AI" aria-label="Message for AI"
            aria-describedby="button-addon2" ref="messageInput" id="ai_chat_input" v-on:keyup.enter="formSendMessage">
          <button class="btn btn-outline-secondary" type="button" id="button-addon2"
            @click="formSendMessage">Send</button>
        </div>
      </div>

      <div v-show="!state.isChatting">
        <button type="button" class="btn btn-primary btn-lg" @click="startChatting">Start Chat with AI</button>
      </div>
    </div>

    <div id="room_chat_area">
      <div id="room_chat_message_box">
        <div v-for="(message, index) in state.roomChatMessageHistory">
          <div v-bind:class="message.isUserSender ? 'user_message' : 'assistant_message'">
            <div class="message_span">
              <b>{{ message.username }}:</b> {{ message.message }}
            </div>
          </div>
        </div>
        <div ref="roomChatMessagesEnd"></div>
      </div>

      <div id="room_chat_input_container">
        <div id="new_messages_button_container"
          style="position: absolute; text-align: center; background-color: transparent; width: 100%; height: 100%; bottom: 60px;">
          <span style="padding: 10px; cursor: pointer; border-radius: 3px; background-color: rgba(255, 255, 255, 0.2);"
            id="new_messages_button">
            New messages
          </span>
        </div>
        <div class="input-group">
          <input type="text" class="form-control" placeholder="Message for room" aria-label="Message for room"
            aria-describedby="button-addon2" ref="roomChatMessageInput" id="room_chat_input"
            v-on:keyup.enter="roomChatSendMessage">
          <button class="btn btn-outline-secondary" type="button" id="button-addon2"
            @click="roomChatSendMessage">Send</button>
        </div>
      </div>
    </div>

    <div id="settings_area">
      <span style="cursor: pointer;" data-bs-toggle="modal" data-bs-target="#settingsModal">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-gear"
          viewBox="0 0 16 16">
          <path
            d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
          <path
            d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" />
        </svg>
      </span>
    </div>
  </div>

  <!-- Modal -->
  <div class="modal fade" id="settingsModal" tabindex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-header">
          <h1 class="modal-title fs-5" id="exampleModalLabel">RoboParty 🤖🎉</h1>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            RoboParty is a 3D world where you can party with friends using a robot avatar controlled by AI.
            It uses <a target="_blank" href="https://windowai.io/">window.ai</a>, which
            allows you to plug in your own AI model (e.g. GPT-3). You can talk to the AI to change your username and
            avatar color, perform different moves, emotes, and facial expressions, or have general conversations.
          </div>
          <div class="mb-3">
            <b>Controls:</b>
            <ul>
              <li>WASD or arrow keys to move</li>
              <li>Click and drag mouse to look around</li>
              <li>Scroll to zoom in and out</li>
              <li>Talk to the AI to change username and avatar color</li>
              <li>Talk to the AI to perform different moves, emotes, and facial expressions</li>
            </ul>
          </div>
          <div>
            Powered by <a target="_blank" href="https://windowai.io/">window.ai</a> and <a target="_blank"
              href="https://threejs.org/">three.js</a>.
            Made by <a target="_blank" href="https://twitter.com/zoan37">zoan.eth</a>. View <a target="_blank"
              href="https://github.com/zoan37/roboparty">source code on GitHub</a>.
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
#interface_container {
  text-align: left;
}

#chat_area {
  position: absolute;
  bottom: 5px;
  left: 0px;
  padding: 20px;
  background-color: transparent;
  z-index: 100;
  width: 350px;
}

#settings_area {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 20px;
  background-color: transparent;
  z-index: 200;
}

.user_message {
  display: flex;
  flex-direction: row-reverse;
  color: darkblue;
  max-width: auto;
}

.user_message .message_span {
  background-color: rgba(0, 0, 255, 0.1);
  border-radius: 6px;
  padding: 10px;
  margin: 5px;
}

.assistant_message {
  display: flex;
  color: black;
  max-width: auto;
}

.assistant_message .message_span {
  background-color: rgba(0, 0, 0, 0.08);
  border-radius: 6px;
  padding: 10px;
  margin: 5px;
}

#chat_message_box {
  overflow-y: scroll;
  height: 500px;
  padding: 10px;
  margin-bottom: 15px;
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.05);
}

#room_chat_area {
  position: absolute;
  bottom: 5px;
  right: 0px;
  padding: 20px;
  background-color: transparent;
  width: 350px;
}

#room_chat_message_box {
  overflow-y: scroll;
  height: 500px;
  padding: 10px;
  margin-bottom: 15px;
  border-radius: 6px;
  background-color: rgba(0, 0, 0, 0.05);
}

#ai_chat_input {
  background-color: rgb(255, 255, 255, 0.25);
}

#room_chat_input {
  background-color: rgb(255, 255, 255, 0.25);
}

#room_chat_input_container {
  position: relative;
}
</style>
