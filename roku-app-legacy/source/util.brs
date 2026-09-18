' Current UTC seconds since epoch.
function getUtcSeconds() as Integer
    dt = CreateObject("roDateTime")
    return dt.AsSeconds()
end function

' Given a channel dict and current UTC epoch seconds, return the video
' scheduled to play at this moment (based on 24h synchronized schedule).
function getCurrentVideo(channel as Object, nowUtc as Integer) as Object
    videos = channel.videos
    if videos = invalid or videos.Count() = 0 then return invalid

    ' Compute channel timeline: sum of durations
    totalDur = 0
    for each v in videos
        d = v.duration
        if d = invalid or d <= 0 then d = 300
        totalDur = totalDur + d
    end for
    if totalDur <= 0 then return invalid

    ' Seconds into the current UTC day
    secondsInDay = nowUtc mod 86400
    offset = secondsInDay mod totalDur

    accum = 0
    for each v in videos
        d = v.duration
        if d = invalid or d <= 0 then d = 300
        if offset < accum + d
            result = {}
            result.video = v
            result.seek = offset - accum
            return result
        end if
        accum = accum + d
    end for
    return invalid
end function
